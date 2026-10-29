-- COLOR ARENA: isolated, non-redeemable virtual TISH. Never modify public.users.balance.
-- Each RPC is callable by service_role only after server-side Telegram initData verification.
create table if not exists public.color_arena_wallets(
  user_id bigint primary key references public.users(id) on delete cascade,
  balance bigint not null default 1000 check(balance >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.color_arena_rooms(
  id uuid primary key default gen_random_uuid(),
  owner_id bigint not null references public.users(id),
  status text not null default 'WAITING'
    check(status in ('WAITING','BETTING','LOCKED','ROLLING','RESULT')),
  min_stake integer not null check(min_stake between 5 and 500),
  max_players integer not null check(max_players between 2 and 8),
  round_no integer not null default 1,
  round_id uuid not null default gen_random_uuid(),
  seed integer not null default (floor(random()*1000000)::integer),
  total_stake bigint not null default 0 check(total_stake>=0),
  betting_ends_at timestamptz,
  rolling_at timestamptz,
  roll_ends_at timestamptz,
  result_ends_at timestamptz,
  winner_id bigint references public.users(id),
  finish_x numeric(12,10),
  finish_y numeric(12,10),
  snapshot jsonb not null default '[]'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists color_arena_rooms_lobby_idx on public.color_arena_rooms(status,updated_at desc);
create table if not exists public.color_arena_bets(
  id bigserial primary key,
  room_id uuid not null references public.color_arena_rooms(id),
  round_id uuid not null,
  user_id bigint not null references public.users(id),
  seat integer not null check(seat between 0 and 7),
  stake bigint not null check(stake >= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(round_id,user_id),
  unique(round_id,seat)
);
create index if not exists color_arena_bets_room_idx on public.color_arena_bets(room_id,round_id,seat);
create table if not exists public.color_arena_ledger(
  id bigserial primary key,
  user_id bigint not null references public.users(id),
  room_id uuid references public.color_arena_rooms(id),
  round_id uuid,
  request_id uuid,
  kind text not null check(kind in ('welcome','stake','refund','win')),
  amount bigint not null check(amount<>0),
  created_at timestamptz not null default now(),
  unique(user_id,request_id)
);
create unique index if not exists color_arena_ledger_win_once on public.color_arena_ledger(round_id) where kind='win';
create unique index if not exists color_arena_ledger_refund_once on public.color_arena_ledger(round_id,user_id) where kind='refund';
create table if not exists public.color_arena_history(
  round_id uuid primary key,
  room_id uuid not null references public.color_arena_rooms(id),
  round_no integer not null,
  winner_id bigint not null references public.users(id),
  pot bigint not null check(pot>0),
  seed integer not null,
  snapshot jsonb not null,
  finish_x numeric(12,10) not null,
  finish_y numeric(12,10) not null,
  created_at timestamptz not null default now()
);
create index if not exists color_arena_history_room_idx on public.color_arena_history(room_id,created_at desc);
create table if not exists public.color_arena_events(
  id bigserial primary key,
  room_id uuid not null,
  changed_at timestamptz not null default now()
);
create index if not exists color_arena_events_room_idx on public.color_arena_events(room_id,id desc);
do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='color_arena_events') then
    alter publication supabase_realtime add table public.color_arena_events;
  end if;
end $$;
alter table public.color_arena_wallets enable row level security;
alter table public.color_arena_rooms enable row level security;
alter table public.color_arena_bets enable row level security;
alter table public.color_arena_ledger enable row level security;
alter table public.color_arena_history enable row level security;
alter table public.color_arena_events enable row level security;
revoke all on public.color_arena_wallets,public.color_arena_rooms,public.color_arena_bets,public.color_arena_ledger,public.color_arena_history,public.color_arena_events from public,anon,authenticated;
grant all on public.color_arena_wallets,public.color_arena_rooms,public.color_arena_bets,public.color_arena_ledger,public.color_arena_history,public.color_arena_events to service_role;
grant usage,select on all sequences in schema public to service_role;
grant select on public.color_arena_events to anon,authenticated;
drop policy if exists "color_arena_events_read" on public.color_arena_events;
create policy "color_arena_events_read" on public.color_arena_events for select to anon,authenticated using (true);

-- One-time free credit grant; never exchangeable with Stars, TON, gifts or real money.
create or replace function public.color_arena_wallet_init(p_user bigint)
returns bigint language plpgsql security invoker set search_path='' as $$
declare v_balance bigint;
begin
  insert into public.color_arena_wallets(user_id) values(p_user) on conflict do nothing;
  if found then
    insert into public.color_arena_ledger(user_id,kind,amount) values(p_user,'welcome',1000);
  end if;
  select balance into v_balance from public.color_arena_wallets where user_id=p_user;
  return v_balance;
end $$;

create or replace function public.color_arena_create(p_user bigint,p_min integer,p_max integer,p_stake integer,p_request uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_room uuid; v_balance bigint;
begin
  perform pg_advisory_xact_lock(p_user);
  if p_request is null or p_min not between 5 and 500 or p_max not between 2 and 8
    or p_stake<p_min or p_stake>200000 or p_stake is null then raise exception 'ARENA_INVALID_ENTRY'; end if;
  select room_id into v_room from public.color_arena_ledger where user_id=p_user and request_id=p_request;
  if found then return v_room; end if;
  if not exists(select 1 from public.users where id=p_user and is_banned=false) then raise exception 'ARENA_NO_USER'; end if;
  perform public.color_arena_wallet_init(p_user);
  update public.color_arena_wallets set balance=balance-p_stake where user_id=p_user and balance>=p_stake returning balance into v_balance;
  if not found then raise exception 'ARENA_NO_TISH'; end if;
  insert into public.color_arena_rooms(owner_id,min_stake,max_players,total_stake)
    values(p_user,p_min,p_max,p_stake) returning id into v_room;
  insert into public.color_arena_bets(room_id,round_id,user_id,seat,stake)
    select id,round_id,p_user,0,p_stake from public.color_arena_rooms where id=v_room;
  insert into public.color_arena_ledger(user_id,room_id,round_id,request_id,kind,amount)
    select p_user,id,round_id,p_request,'stake',-p_stake from public.color_arena_rooms where id=v_room;
  insert into public.color_arena_events(room_id) values(v_room);
  return v_room;
end $$;

create or replace function public.color_arena_join(p_room uuid,p_user bigint,p_stake integer,p_request uuid)
returns bigint language plpgsql security invoker set search_path='' as $$
declare v_room public.color_arena_rooms%rowtype;v_count integer;v_balance bigint;
begin
  perform pg_advisory_xact_lock(p_user);
  if p_request is null or p_stake is null or p_stake<5 or p_stake>200000 then raise exception 'ARENA_INVALID_ENTRY'; end if;
  if exists(select 1 from public.color_arena_ledger where user_id=p_user and request_id=p_request) then
    return (select balance from public.color_arena_wallets where user_id=p_user);
  end if;
  select * into v_room from public.color_arena_rooms where id=p_room for update;
  if not found then raise exception 'ARENA_NO_ROOM'; end if;
  if v_room.status not in ('WAITING','BETTING') or
    (v_room.status='BETTING' and clock_timestamp()>=v_room.betting_ends_at)
    then raise exception 'ARENA_BETS_LOCKED'; end if;
  if p_stake<v_room.min_stake then raise exception 'ARENA_MIN_STAKE'; end if;
  if exists(select 1 from public.color_arena_bets where round_id=v_room.round_id and user_id=p_user)
    then raise exception 'ARENA_ALREADY_JOINED'; end if;
  select count(*) into v_count from public.color_arena_bets where round_id=v_room.round_id;
  if v_count>=v_room.max_players then raise exception 'ARENA_ROOM_FULL'; end if;
  if not exists(select 1 from public.users where id=p_user and is_banned=false) then raise exception 'ARENA_NO_USER'; end if;
  perform public.color_arena_wallet_init(p_user);
  update public.color_arena_wallets set balance=balance-p_stake where user_id=p_user and balance>=p_stake returning balance into v_balance;
  if not found then raise exception 'ARENA_NO_TISH'; end if;
  insert into public.color_arena_bets(room_id,round_id,user_id,seat,stake)
    values(p_room,v_room.round_id,p_user,v_count,p_stake);
  update public.color_arena_rooms set
    total_stake=total_stake+p_stake,
    status=case when status='WAITING' then 'BETTING' else status end,
    betting_ends_at=case when status='WAITING' then clock_timestamp()+interval '30 seconds' else betting_ends_at end,
    version=version+1,updated_at=now() where id=p_room;
  insert into public.color_arena_ledger(user_id,room_id,round_id,request_id,kind,amount)
    values(p_user,p_room,v_room.round_id,p_request,'stake',-p_stake);
  insert into public.color_arena_events(room_id) values(p_room);
  return v_balance;
end $$;

create or replace function public.color_arena_raise(p_room uuid,p_user bigint,p_amount integer,p_request uuid)
returns bigint language plpgsql security invoker set search_path='' as $$
declare v_room public.color_arena_rooms%rowtype;v_balance bigint;
begin
  perform pg_advisory_xact_lock(p_user);
  if p_request is null or p_amount is null or p_amount<1 or p_amount>200000 then raise exception 'ARENA_INVALID_ENTRY'; end if;
  if exists(select 1 from public.color_arena_ledger where user_id=p_user and request_id=p_request) then
    return (select balance from public.color_arena_wallets where user_id=p_user);
  end if;
  select * into v_room from public.color_arena_rooms where id=p_room for update;
  if not found then raise exception 'ARENA_NO_ROOM'; end if;
  if v_room.status not in ('WAITING','BETTING') or
     (v_room.status='BETTING' and clock_timestamp()>=v_room.betting_ends_at)
     then raise exception 'ARENA_BETS_LOCKED'; end if;
  if not exists(select 1 from public.color_arena_bets where round_id=v_room.round_id and user_id=p_user) then
    raise exception 'ARENA_NOT_PLAYER'; end if;
  update public.color_arena_wallets set balance=balance-p_amount
     where user_id=p_user and balance>=p_amount returning balance into v_balance;
  if not found then raise exception 'ARENA_NO_TISH'; end if;
  update public.color_arena_bets set stake=stake+p_amount,updated_at=now()
     where round_id=v_room.round_id and user_id=p_user;
  update public.color_arena_rooms set total_stake=total_stake+p_amount,version=version+1,updated_at=now() where id=p_room;
  insert into public.color_arena_ledger(user_id,room_id,round_id,request_id,kind,amount)
    values(p_user,p_room,v_room.round_id,p_request,'stake',-p_amount);
  insert into public.color_arena_events(room_id) values(p_room);
  return v_balance;
end $$;

create or replace function public.color_arena_tick(p_room uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare v public.color_arena_rooms%rowtype;v_count integer;
begin
  select * into v from public.color_arena_rooms where id=p_room for update;
  if not found then raise exception 'ARENA_NO_ROOM'; end if;
  if v.status='BETTING' and clock_timestamp()>=v.betting_ends_at then
    select count(*) into v_count from public.color_arena_bets where round_id=v.round_id;
    if v_count < 2 then raise exception 'ARENA_MIN_PLAYERS'; end if;
    update public.color_arena_rooms set status='LOCKED',
      snapshot=(select jsonb_agg(jsonb_build_object('user_id',b.user_id,'stake',b.stake,'seat',b.seat) order by b.seat)
        from public.color_arena_bets b where b.round_id=v.round_id),
      rolling_at=clock_timestamp()+interval '1 second',
      roll_ends_at=clock_timestamp()+interval '11 seconds',
      version=version+1,updated_at=now() where id=p_room;
    insert into public.color_arena_events(room_id) values(p_room);
    return 'LOCKED';
  end if;
  if v.status='LOCKED' and clock_timestamp()>=v.rolling_at then
    update public.color_arena_rooms set status='ROLLING',version=version+1,updated_at=now() where id=p_room;
    insert into public.color_arena_events(room_id) values(p_room);
    return 'ROLLING';
  end if;
  if v.status='RESULT' and clock_timestamp()>=v.result_ends_at then
    update public.color_arena_rooms set status='WAITING',round_no=round_no+1,round_id=gen_random_uuid(),
      seed=floor(random()*1000000)::integer,total_stake=0,
      betting_ends_at=null,rolling_at=null,roll_ends_at=null,result_ends_at=null,
      winner_id=null,finish_x=null,finish_y=null,snapshot='[]'::jsonb,
      version=version+1,updated_at=now() where id=p_room;
    insert into public.color_arena_events(room_id) values(p_room);
    return 'WAITING';
  end if;
  return v.status;
end $$;

-- The server supplies CSPRNG coordinates. SQL determines the winner from the frozen stake geometry.
-- Each internal wave boundary has integral 0 over y, so actual geometric area equals stake/pot.
create or replace function public.color_arena_finish(p_room uuid,p_round uuid,p_x numeric,p_y numeric)
returns bigint language plpgsql security invoker set search_path='' as $$
declare v public.color_arena_rooms%rowtype;v_row record;v_sum numeric:=0;v_prev numeric:=0;
        v_boundary numeric;v_share numeric;v_leftshare numeric;v_amp numeric;
        v_seedphase numeric;v_frequency integer;v_winner bigint:=null;v_i integer:=0;v_n integer;
begin
  select * into v from public.color_arena_rooms where id=p_room for update;
  if not found then raise exception 'ARENA_NO_ROOM'; end if;
  if v.round_id<>p_round then raise exception 'ARENA_STALE_ROUND'; end if;
  if v.status='RESULT' then return v.winner_id; end if;
  if v.status<>'ROLLING' or clock_timestamp()<v.roll_ends_at then raise exception 'ARENA_NOT_FINISHABLE'; end if;
  if p_x is null or p_y is null or p_x<0 or p_x>=1 or p_y<0 or p_y>=1 then
    raise exception 'ARENA_INVALID_POINT'; end if;
  v_frequency:=1+(v.seed%2);
  v_seedphase:=(v.seed%360)::numeric/360;
  select count(*) into v_n from public.color_arena_bets where round_id=v.round_id;
  for v_row in select user_id,stake,seat from public.color_arena_bets where round_id=v.round_id order by seat loop
    v_i:=v_i+1;
    v_share:=v_row.stake::numeric/v.total_stake;
    v_sum:=v_sum+v_share;
    if v_i=v_n then
      v_boundary:=1;
    else
      select least(v_share, b.stake::numeric/v.total_stake)*0.12 into v_amp
        from public.color_arena_bets b where b.round_id=v.round_id and b.seat=v_row.seat+1;
      v_boundary:=v_sum+v_amp*sin(2*pi()*(v_frequency*p_y+v_seedphase+v_i*0.37));
    end if;
    if p_x<v_boundary or v_i=v_n then v_winner:=v_row.user_id;exit;end if;
    v_prev:=v_boundary;
  end loop;
  if v_winner is null or v_n<2 then raise exception 'ARENA_INVALID_GEOMETRY'; end if;
  insert into public.color_arena_history(round_id,room_id,round_no,winner_id,pot,seed,snapshot,finish_x,finish_y)
    values(v.round_id,v.id,v.round_no,v_winner,v.total_stake,v.seed,v.snapshot,p_x,p_y);
  update public.color_arena_wallets set balance=balance+v.total_stake where user_id=v_winner;
  if not found then raise exception 'ARENA_WINNER_WALLET_MISSING'; end if;
  insert into public.color_arena_ledger(user_id,room_id,round_id,kind,amount)
    values(v_winner,v.id,v.round_id,'win',v.total_stake);
  update public.color_arena_rooms set status='RESULT',winner_id=v_winner,
    finish_x=p_x,finish_y=p_y,result_ends_at=clock_timestamp()+interval '8 seconds',
    version=version+1,updated_at=now() where id=v.id;
  insert into public.color_arena_events(room_id) values(v.id);
  return v_winner;
end $$;

create or replace function public.color_arena_cancel(p_room uuid,p_user bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v public.color_arena_rooms%rowtype;r record;
begin
  select * into v from public.color_arena_rooms where id=p_room for update;
  if not found then raise exception 'ARENA_NO_ROOM'; end if;
  if v.status<>'WAITING' or v.owner_id<>p_user then raise exception 'ARENA_CANNOT_CANCEL'; end if;
  for r in select user_id,stake from public.color_arena_bets where round_id=v.round_id loop
    update public.color_arena_wallets set balance=balance+r.stake where user_id=r.user_id;
    insert into public.color_arena_ledger(user_id,room_id,round_id,kind,amount)
      values(r.user_id,v.id,v.round_id,'refund',r.stake);
  end loop;
  delete from public.color_arena_bets where round_id=v.round_id;
  delete from public.color_arena_rooms where id=v.id;
  insert into public.color_arena_events(room_id) values(v.id);
  return true;
end $$;
revoke execute on function public.color_arena_wallet_init(bigint),public.color_arena_create(bigint,integer,integer,integer,uuid),
  public.color_arena_join(uuid,bigint,integer,uuid),public.color_arena_raise(uuid,bigint,integer,uuid),
  public.color_arena_tick(uuid),public.color_arena_finish(uuid,uuid,numeric,numeric),
  public.color_arena_cancel(uuid,bigint)
from public,anon,authenticated;
grant execute on function public.color_arena_wallet_init(bigint),public.color_arena_create(bigint,integer,integer,integer,uuid),
  public.color_arena_join(uuid,bigint,integer,uuid),public.color_arena_raise(uuid,bigint,integer,uuid),
  public.color_arena_tick(uuid),public.color_arena_finish(uuid,uuid,numeric,numeric),
  public.color_arena_cancel(uuid,bigint)
to service_role;
