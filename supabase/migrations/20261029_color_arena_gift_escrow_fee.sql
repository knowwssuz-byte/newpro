-- Secure escrow: gift face value adds to area odds, but gifts are transferred,
-- never minted as Stars. Stars fee is applied only to the cash Stars portion.
create table if not exists public.color_arena_fee_settings(
 id boolean primary key default true check(id=true),
 fee_bps integer not null default 500 check(fee_bps between 0 and 1000),
 updated_at timestamptz not null default now()
);
insert into public.color_arena_fee_settings(id,fee_bps) values(true,500) on conflict(id) do nothing;
revoke all on public.color_arena_fee_settings from public,anon,authenticated;
grant select on public.color_arena_fee_settings to service_role;
alter table public.color_arena_fee_settings enable row level security;
alter table public.color_arena_rooms add column if not exists fee_bps integer not null default 0;
alter table public.color_arena_rooms drop constraint if exists color_arena_rooms_fee_bps_check;
alter table public.color_arena_rooms add constraint color_arena_rooms_fee_bps_check check(fee_bps between 0 and 1000);
-- Never change terms of a round that has an accepted stake.
update public.color_arena_rooms set fee_bps=500 where is_public and status='WAITING' and total_stake=0;

create table if not exists public.color_arena_platform_revenue(
 round_id uuid primary key,room_id uuid not null references public.color_arena_rooms(id),
 gross_stars bigint not null check(gross_stars>=0),fee_stars bigint not null check(fee_stars>=0),
 net_stars bigint not null check(net_stars>=0),fee_bps integer not null,
 created_at timestamptz not null default now(),
 constraint arena_platform_sum check(gross_stars=fee_stars+net_stars)
);
alter table public.color_arena_platform_revenue enable row level security;
revoke all on public.color_arena_platform_revenue from public,anon,authenticated;
grant select,insert on public.color_arena_platform_revenue to service_role;

create table if not exists public.color_arena_gift_stakes(
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.color_arena_rooms(id),
 round_id uuid not null,
 history_id uuid not null references public.open_history(id),
 owner_id bigint not null references public.users(id),
 request_id uuid not null,
 value_stars bigint not null check(value_stars between 1 and 200000),
 status text not null default 'locked' check(status in ('locked','settled','refunded')),
 winner_id bigint references public.users(id),
 settled_at timestamptz,
 created_at timestamptz not null default now(),
 unique(owner_id,request_id),unique(round_id,history_id)
);
create unique index if not exists arena_gift_one_active_escrow on public.color_arena_gift_stakes(history_id) where status='locked';
create index if not exists arena_gift_round_lookup on public.color_arena_gift_stakes(round_id,status);
alter table public.color_arena_gift_stakes enable row level security;
revoke all on public.color_arena_gift_stakes from public,anon,authenticated;
grant select,insert,update on public.color_arena_gift_stakes to service_role;

-- Even if a competing endpoint skips the arena RPC, it cannot sell, upgrade
-- or transfer a gift already escrowed for this round.
create or replace function public.arena_protect_escrowed_gift()
returns trigger language plpgsql security invoker set search_path='' as $guard$
begin
 if exists(select 1 from public.color_arena_gift_stakes
   where history_id=old.id and status='locked') then
   raise exception 'ARENA_GIFT_ESCROWED';
 end if;
 return coalesce(new,old);
end $guard$;
drop trigger if exists arena_guard_owned_gift on public.open_history;
create trigger arena_guard_owned_gift before update of user_id,sold_at,upgraded_at or delete
 on public.open_history for each row execute function public.arena_protect_escrowed_gift();

create or replace function public.arena_protect_withdraw_request()
returns trigger language plpgsql security invoker set search_path='' as $withdraw_guard$
begin
 perform 1 from public.open_history where id=new.history_id for update;
 if exists(select 1 from public.color_arena_gift_stakes
   where history_id=new.history_id and status='locked') then
   raise exception 'ARENA_GIFT_ESCROWED';
 end if;
 return new;
end $withdraw_guard$;
drop trigger if exists arena_guard_gift_withdraw on public.withdraw_requests;
create trigger arena_guard_gift_withdraw before insert on public.withdraw_requests
 for each row execute function public.arena_protect_withdraw_request();
revoke all on function public.arena_protect_escrowed_gift(),public.arena_protect_withdraw_request()
 from public,anon,authenticated;

-- Gift pledge is an idempotent, transactional participation or area increase.
create or replace function public.color_arena_stake_gift(
 p_room uuid,p_user bigint,p_history uuid,p_request uuid)
returns jsonb language plpgsql security invoker set search_path='' as $gift_pledge$
declare v_room public.color_arena_rooms%rowtype;v_hist public.open_history%rowtype;
 v_gift public.gifts%rowtype;v_count integer;v_value bigint;v_existing public.color_arena_gift_stakes%rowtype;
begin
 perform pg_advisory_xact_lock(p_user);
 if p_request is null or p_history is null then raise exception 'ARENA_INVALID_ENTRY'; end if;
 select * into v_existing from public.color_arena_gift_stakes
   where owner_id=p_user and request_id=p_request;
 if found then return jsonb_build_object('value',v_existing.value_stars,'historyId',v_existing.history_id,'duplicate',true);end if;
 select * into v_room from public.color_arena_rooms where id=p_room for update;
 if not found or not v_room.is_public then raise exception 'ARENA_NO_ROOM';end if;
 if v_room.status not in ('WAITING','BETTING') or
   (v_room.status='BETTING' and clock_timestamp()>=v_room.betting_ends_at)
   then raise exception 'ARENA_BETS_LOCKED';end if;
 select * into v_hist from public.open_history where id=p_history and user_id=p_user for update;
 if not found or v_hist.sold_at is not null or v_hist.upgraded_at is not null
   then raise exception 'ARENA_GIFT_UNAVAILABLE';end if;
 if exists(select 1 from public.withdraw_requests where history_id=p_history)
   or exists(select 1 from public.color_arena_gift_stakes where history_id=p_history and status='locked')
   then raise exception 'ARENA_GIFT_UNAVAILABLE';end if;
 select * into v_gift from public.gifts where id=v_hist.gift_id;
 if not found or lower(coalesce(v_gift.type,'gift'))<>'gift'
   then raise exception 'ARENA_GIFT_UNAVAILABLE';end if;
 v_value:=floor(greatest(0,coalesce(v_gift.sell_price,v_gift.buy_price,v_gift.floor_price,0)))::bigint;
 if v_value<1 or v_value>200000 then raise exception 'ARENA_GIFT_VALUE_INVALID';end if;
 select count(*) into v_count from public.color_arena_bets where round_id=v_room.round_id;
 if not exists(select 1 from public.color_arena_bets where round_id=v_room.round_id and user_id=p_user) then
   if v_value<v_room.min_stake then raise exception 'ARENA_MIN_STAKE';end if;
   insert into public.color_arena_bets(room_id,round_id,user_id,seat,stake)
     values(p_room,v_room.round_id,p_user,v_count,v_value);
 else
   update public.color_arena_bets set stake=stake+v_value,updated_at=now()
     where round_id=v_room.round_id and user_id=p_user;
 end if;
 insert into public.color_arena_gift_stakes(room_id,round_id,history_id,owner_id,request_id,value_stars)
   values(p_room,v_room.round_id,p_history,p_user,p_request,v_value);
 update public.color_arena_rooms set total_stake=total_stake+v_value,
   status=case when status='WAITING' and v_count>=1 then 'BETTING' else status end,
   betting_ends_at=case when status='WAITING' and v_count>=1
     then clock_timestamp()+interval '30 seconds' else betting_ends_at end,
   version=version+1,updated_at=now() where id=p_room;
 insert into public.color_arena_events(room_id) values(p_room);
 return jsonb_build_object('value',v_value,'historyId',p_history,'duplicate',false);
end $gift_pledge$;

revoke all on function public.color_arena_stake_gift(uuid,bigint,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.color_arena_stake_gift(uuid,bigint,uuid,uuid) to service_role;

create or replace function public.color_arena_finish(
  p_room uuid,p_round uuid,p_x numeric,p_y numeric)
returns bigint language plpgsql security invoker set search_path='' as $stars_finish$
declare v public.color_arena_rooms%rowtype;
        r record; v_total numeric:=0;v_cut numeric;v_amp numeric;
        v_phase numeric;v_frequency integer;v_winner bigint;
        v_gift_value bigint;v_stars_pot bigint;v_platform_fee bigint;
        v_prize bigint;
begin
  select * into v from public.color_arena_rooms where id=p_room for update;
  if not found then raise exception 'ARENA_NO_ROOM'; end if;
  if v.round_id<>p_round then raise exception 'ARENA_STALE_ROUND'; end if;
  if v.status='RESULT' then return v.winner_id; end if;
  if v.status<>'ROLLING' or clock_timestamp()<v.roll_ends_at then
    raise exception 'ARENA_NOT_FINISHABLE'; end if;
  if p_x is null or p_y is null or p_x<>v.finish_x or p_y<>v.finish_y
    or p_x<0 or p_x>=1 or p_y<0 or p_y>=1 then
    raise exception 'ARENA_INVALID_POINT'; end if;
  v_frequency:=1+(v.seed%2);
  v_phase:=(v.seed%360)::numeric/360;
  for r in select b.user_id,b.stake,b.seat,
       lead(b.stake) over(order by b.seat) as next_stake,
       row_number() over(order by b.seat) as rn
       from public.color_arena_bets b where b.round_id=v.round_id order by b.seat
  loop
    v_total:=v_total+r.stake::numeric/v.total_stake;
    if r.next_stake is null then v_winner:=r.user_id;exit;end if;
    v_amp:=least(r.stake,r.next_stake)::numeric/v.total_stake*0.12;
    v_cut:=v_total+v_amp*sin(2*pi()*(v_frequency*p_y+v_phase+r.rn*0.37));
    if p_x<v_cut then v_winner:=r.user_id;exit;end if;
  end loop;
  if v_winner is null then raise exception 'ARENA_INVALID_GEOMETRY'; end if;
  select coalesce(sum(value_stars),0) into v_gift_value
    from public.color_arena_gift_stakes where round_id=v.round_id and status='locked';
  v_stars_pot:=v.total_stake-v_gift_value;
  if v_stars_pot<0 then raise exception 'ARENA_INVALID_POT'; end if;
  v_platform_fee:=floor(v_stars_pot*v.fee_bps/10000.0);
  v_prize:=v_stars_pot-v_platform_fee;
  insert into public.color_arena_history(
    round_id,room_id,round_no,winner_id,pot,seed,snapshot,finish_x,finish_y,currency)
    values(v.round_id,v.id,v.round_no,v_winner,v.total_stake,v.seed,v.snapshot,p_x,p_y,'stars');
  insert into public.color_arena_platform_revenue(round_id,room_id,gross_stars,fee_stars,net_stars,fee_bps)
    values(v.round_id,v.id,v_stars_pot,v_platform_fee,v_prize,v.fee_bps);
  if v_prize>0 then
    update public.users set balance=balance+v_prize,updated_at=now()
      where id=v_winner;
    if not found then raise exception 'ARENA_WINNER_NOT_FOUND'; end if;
    insert into public.color_arena_stars_ledger(user_id,room_id,round_id,kind,amount)
      values(v_winner,v.id,v.round_id,'win',v_prize);
  end if;
  -- Release escrow before transferring ownership, in this same transaction.
  update public.color_arena_gift_stakes set status='settled',winner_id=v_winner,settled_at=clock_timestamp()
    where round_id=v.round_id and status='locked';
  update public.open_history h set user_id=v_winner
    from public.color_arena_gift_stakes g
    where g.round_id=v.round_id and g.status='settled' and g.history_id=h.id;
  update public.color_arena_rooms set status='RESULT',winner_id=v_winner,
    finish_x=p_x,finish_y=p_y,result_ends_at=clock_timestamp()+interval '8 seconds',
    version=version+1,updated_at=now() where id=v.id;
  insert into public.color_arena_events(room_id) values(v.id);
  return v_winner;
end $stars_finish$;
create or replace function public.color_arena_leave_waiting(
  p_user bigint,p_room uuid)
returns boolean language plpgsql security invoker set search_path='' as $stars_leave$
declare v public.color_arena_rooms%rowtype;v_stake bigint;v_gift_value bigint;v_stars bigint;
begin
  select * into v from public.color_arena_rooms where id=p_room for update;
  if not found or not v.is_public or v.status<>'WAITING' then
    raise exception 'ARENA_CANNOT_CANCEL'; end if;
  select stake into v_stake from public.color_arena_bets
    where round_id=v.round_id and user_id=p_user for update;
  if not found then raise exception 'ARENA_NOT_PLAYER'; end if;
  if (select count(*) from public.color_arena_bets where round_id=v.round_id)<>1 then
    raise exception 'ARENA_CANNOT_CANCEL'; end if;
  select coalesce(sum(value_stars),0) into v_gift_value
    from public.color_arena_gift_stakes where round_id=v.round_id and owner_id=p_user and status='locked';
  v_stars:=v_stake-v_gift_value;
  if v_stars<0 then raise exception 'ARENA_INVALID_POT'; end if;
  if v_stars>0 then
    update public.users set balance=balance+v_stars,updated_at=now() where id=p_user;
    if not found then raise exception 'ARENA_NO_USER'; end if;
    insert into public.color_arena_stars_ledger(user_id,room_id,round_id,kind,amount)
      values(p_user,v.id,v.round_id,'refund',v_stars);
  end if;
  update public.color_arena_gift_stakes set status='refunded',settled_at=clock_timestamp()
    where round_id=v.round_id and owner_id=p_user and status='locked';
  delete from public.color_arena_bets where round_id=v.round_id;
  update public.color_arena_rooms set
    total_stake=0,round_id=gen_random_uuid(),round_no=round_no+1,
    version=version+1,updated_at=now() where id=v.id;
  insert into public.color_arena_events(room_id) values(v.id);
  return true;
end $stars_leave$;

-- Set the next public round's fee only after the previous round has settled.
-- Recreate from the existing base tick function without changing state timing.
