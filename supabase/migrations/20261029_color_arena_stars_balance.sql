-- COLOR ARENA: migrate public rounds from promotional TISH to existing Stars balance.
-- Historical virtual-credit wallets, ledgers, and outcomes are preserved separately.
alter table public.color_arena_history
  add column if not exists currency text not null default 'tish';
alter table public.color_arena_history
  drop constraint if exists color_arena_history_currency_check;
alter table public.color_arena_history
  add constraint color_arena_history_currency_check check(currency in ('tish','stars'));

create table if not exists public.color_arena_stars_ledger(
  id bigserial primary key,
  user_id bigint not null references public.users(id),
  room_id uuid not null references public.color_arena_rooms(id),
  round_id uuid not null,
  request_id uuid,
  kind text not null check(kind in ('stake','refund','win')),
  amount bigint not null check(amount<>0),
  created_at timestamptz not null default now(),
  unique(user_id,request_id)
);
create unique index if not exists color_arena_stars_win_once
  on public.color_arena_stars_ledger(round_id) where kind='win';
create unique index if not exists color_arena_stars_refund_once
  on public.color_arena_stars_ledger(round_id,user_id) where kind='refund';
create index if not exists color_arena_stars_user_history
  on public.color_arena_stars_ledger(user_id,created_at desc);
alter table public.color_arena_stars_ledger enable row level security;
revoke all on public.color_arena_stars_ledger from public,anon,authenticated;
grant select,insert on public.color_arena_stars_ledger to service_role;
grant usage,select on sequence public.color_arena_stars_ledger_id_seq to service_role;

-- A former TISH round must not become a Stars round by accident.
-- If there is a single active WAITING virtual wager, refund the original
-- promotional currency, then issue a fresh public round ID atomically.
do $legacy_reset$
declare v public.color_arena_rooms%rowtype; r record; v_count integer;
begin
  select * into v from public.color_arena_rooms where is_public=true for update;
  if not found then raise exception 'ARENA_PUBLIC_ROOM_NOT_FOUND'; end if;
  if v.status <> 'WAITING' then raise exception 'ARENA_STARS_MIGRATION_ACTIVE_ROUND'; end if;
  select count(*) into v_count from public.color_arena_bets where round_id=v.round_id;
  if v_count>1 then raise exception 'ARENA_STARS_MIGRATION_MULTIPLE_ACTIVE_BETS'; end if;
  for r in select user_id,stake from public.color_arena_bets where round_id=v.round_id loop
    update public.color_arena_wallets set balance=balance+r.stake where user_id=r.user_id;
    if not found then raise exception 'ARENA_LEGACY_WALLET_NOT_FOUND'; end if;
    insert into public.color_arena_ledger(user_id,room_id,round_id,kind,amount)
      values(r.user_id,v.id,v.round_id,'refund',r.stake);
  end loop;
  delete from public.color_arena_bets where round_id=v.round_id;
  update public.color_arena_rooms set
    round_id=gen_random_uuid(),round_no=round_no+1,total_stake=0,
    winner_id=null,finish_x=null,finish_y=null,
    betting_ends_at=null,rolling_at=null,roll_ends_at=null,result_ends_at=null,
    snapshot='[]'::jsonb,version=version+1,updated_at=now()
    where id=v.id;
  insert into public.color_arena_events(room_id) values(v.id);
end $legacy_reset$;

-- ALL future public arena debits come from the real public.users.balance,
-- which is also used by the existing NewPro header, X/O, deposit and games.
create or replace function public.color_arena_join(
  p_room uuid,p_user bigint,p_stake integer,p_request uuid)
returns bigint language plpgsql security invoker set search_path='' as $stars_join$
declare v_room public.color_arena_rooms%rowtype;v_count integer;v_balance numeric;
begin
  perform pg_advisory_xact_lock(p_user);
  if p_request is null or p_stake is null or p_stake<5 or p_stake>200000 then
    raise exception 'ARENA_INVALID_ENTRY'; end if;
  if exists(select 1 from public.color_arena_stars_ledger
    where user_id=p_user and request_id=p_request) then
    return (select floor(balance)::bigint from public.users where id=p_user);
  end if;
  select * into v_room from public.color_arena_rooms where id=p_room for update;
  if not found or not v_room.is_public then raise exception 'ARENA_NO_ROOM'; end if;
  if v_room.status not in ('WAITING','BETTING')
     or (v_room.status='BETTING' and clock_timestamp()>=v_room.betting_ends_at) then
    raise exception 'ARENA_BETS_LOCKED'; end if;
  if p_stake<v_room.min_stake then raise exception 'ARENA_MIN_STAKE'; end if;
  if exists(select 1 from public.color_arena_bets
    where round_id=v_room.round_id and user_id=p_user) then
    raise exception 'ARENA_ALREADY_JOINED'; end if;
  select count(*) into v_count from public.color_arena_bets
    where round_id=v_room.round_id;
  if not exists(select 1 from public.users where id=p_user and is_banned=false)
    then raise exception 'ARENA_NO_USER'; end if;
  update public.users set balance=balance-p_stake,updated_at=now()
    where id=p_user and is_banned=false and balance>=p_stake
    returning balance into v_balance;
  if not found then raise exception 'ARENA_NO_STARS'; end if;
  insert into public.color_arena_bets(room_id,round_id,user_id,seat,stake)
    values(p_room,v_room.round_id,p_user,v_count,p_stake);
  update public.color_arena_rooms set
    total_stake=total_stake+p_stake,
    status=case when status='WAITING' and v_count>=1 then 'BETTING' else status end,
    betting_ends_at=case when status='WAITING' and v_count>=1 then clock_timestamp()+interval '30 seconds' else betting_ends_at end,
    version=version+1,updated_at=now() where id=p_room;
  insert into public.color_arena_stars_ledger(user_id,room_id,round_id,request_id,kind,amount)
    values(p_user,p_room,v_room.round_id,p_request,'stake',-p_stake);
  insert into public.color_arena_events(room_id) values(p_room);
  return floor(v_balance)::bigint;
end $stars_join$;

create or replace function public.color_arena_raise(
  p_room uuid,p_user bigint,p_amount integer,p_request uuid)
returns bigint language plpgsql security invoker set search_path='' as $stars_raise$
declare v_room public.color_arena_rooms%rowtype;v_balance numeric;
begin
  perform pg_advisory_xact_lock(p_user);
  if p_request is null or p_amount is null or p_amount<1 or p_amount>200000 then
    raise exception 'ARENA_INVALID_ENTRY'; end if;
  if exists(select 1 from public.color_arena_stars_ledger
    where user_id=p_user and request_id=p_request) then
    return (select floor(balance)::bigint from public.users where id=p_user);
  end if;
  select * into v_room from public.color_arena_rooms where id=p_room for update;
  if not found or not v_room.is_public then raise exception 'ARENA_NO_ROOM'; end if;
  if v_room.status not in ('WAITING','BETTING')
    or (v_room.status='BETTING' and clock_timestamp()>=v_room.betting_ends_at)
    then raise exception 'ARENA_BETS_LOCKED'; end if;
  if not exists(select 1 from public.color_arena_bets
    where round_id=v_room.round_id and user_id=p_user) then
    raise exception 'ARENA_NOT_PLAYER'; end if;
  update public.users set balance=balance-p_amount,updated_at=now()
    where id=p_user and is_banned=false and balance>=p_amount
    returning balance into v_balance;
  if not found then raise exception 'ARENA_NO_STARS'; end if;
  update public.color_arena_bets set stake=stake+p_amount,updated_at=now()
    where round_id=v_room.round_id and user_id=p_user;
  update public.color_arena_rooms
    set total_stake=total_stake+p_amount,version=version+1,updated_at=now()
    where id=p_room;
  insert into public.color_arena_stars_ledger(user_id,room_id,round_id,request_id,kind,amount)
    values(p_user,p_room,v_room.round_id,p_request,'stake',-p_amount);
  insert into public.color_arena_events(room_id) values(p_room);
  return floor(v_balance)::bigint;
end $stars_raise$;

-- Keep winner selection unchanged: the CSPRNG coordinate and the exact
-- fluid-geometry formula are the same, only the prize's currency changes.
create or replace function public.color_arena_finish(
  p_room uuid,p_round uuid,p_x numeric,p_y numeric)
returns bigint language plpgsql security invoker set search_path='' as $stars_finish$
declare v public.color_arena_rooms%rowtype;
        r record; v_total numeric:=0;v_cut numeric;v_amp numeric;
        v_phase numeric;v_frequency integer;v_winner bigint;
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
  insert into public.color_arena_history(
    round_id,room_id,round_no,winner_id,pot,seed,snapshot,finish_x,finish_y,currency)
    values(v.round_id,v.id,v.round_no,v_winner,v.total_stake,v.seed,v.snapshot,p_x,p_y,'stars');
  update public.users set balance=balance+v.total_stake,updated_at=now()
    where id=v_winner;
  if not found then raise exception 'ARENA_WINNER_NOT_FOUND'; end if;
  insert into public.color_arena_stars_ledger(user_id,room_id,round_id,kind,amount)
    values(v_winner,v.id,v.round_id,'win',v.total_stake);
  update public.color_arena_rooms set status='RESULT',winner_id=v_winner,
    finish_x=p_x,finish_y=p_y,result_ends_at=clock_timestamp()+interval '8 seconds',
    version=version+1,updated_at=now() where id=v.id;
  insert into public.color_arena_events(room_id) values(v.id);
  return v_winner;
end $stars_finish$;

create or replace function public.color_arena_leave_waiting(
  p_user bigint,p_room uuid)
returns boolean language plpgsql security invoker set search_path='' as $stars_leave$
declare v public.color_arena_rooms%rowtype;v_stake bigint;
begin
  select * into v from public.color_arena_rooms where id=p_room for update;
  if not found or not v.is_public or v.status<>'WAITING' then
    raise exception 'ARENA_CANNOT_CANCEL'; end if;
  select stake into v_stake from public.color_arena_bets
    where round_id=v.round_id and user_id=p_user for update;
  if not found then raise exception 'ARENA_NOT_PLAYER'; end if;
  if (select count(*) from public.color_arena_bets where round_id=v.round_id)<>1 then
    raise exception 'ARENA_CANNOT_CANCEL'; end if;
  update public.users set balance=balance+v_stake,updated_at=now() where id=p_user;
  if not found then raise exception 'ARENA_NO_USER'; end if;
  insert into public.color_arena_stars_ledger(user_id,room_id,round_id,kind,amount)
    values(p_user,v.id,v.round_id,'refund',v_stake);
  delete from public.color_arena_bets where round_id=v.round_id;
  update public.color_arena_rooms set
    total_stake=0,round_id=gen_random_uuid(),round_no=round_no+1,
    version=version+1,updated_at=now() where id=v.id;
  insert into public.color_arena_events(room_id) values(v.id);
  return true;
end $stars_leave$;

-- Legacy RPCs return BIGINT. The HTTP API reads NUMERIC balance from users
-- after each operation, so no PostgreSQL function-signature replacement is needed.
revoke execute on function public.color_arena_join(uuid,bigint,integer,uuid),
  public.color_arena_raise(uuid,bigint,integer,uuid),
  public.color_arena_finish(uuid,uuid,numeric,numeric),
  public.color_arena_leave_waiting(bigint,uuid)
  from public,anon,authenticated;
grant execute on function public.color_arena_join(uuid,bigint,integer,uuid),
  public.color_arena_raise(uuid,bigint,integer,uuid),
  public.color_arena_finish(uuid,uuid,numeric,numeric),
  public.color_arena_leave_waiting(bigint,uuid)
  to service_role;
