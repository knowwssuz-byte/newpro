-- Dice game: balance settlement + immutable game history in one DB transaction.
create table if not exists public.dice_rounds (
  id uuid primary key,
  user_id bigint not null references public.users(id),
  mode text not null check (mode in ('higher','lower')),
  target integer not null check (target between 0 and 100),
  roll numeric(5,2) not null check (roll >= 0 and roll < 100),
  won boolean not null,
  bet numeric not null check (bet > 0),
  payout numeric not null check (payout >= 0),
  multiplier numeric(12,2) not null,
  chance_percent numeric(5,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists dice_rounds_created_idx on public.dice_rounds (created_at desc);
create index if not exists dice_rounds_user_created_idx on public.dice_rounds (user_id, created_at desc);
alter table public.dice_rounds enable row level security;
revoke all on table public.dice_rounds from public, anon, authenticated;
grant select, insert on table public.dice_rounds to service_role;

create or replace function public.dice_play_atomic(
  p_id uuid, p_user_id bigint, p_mode text, p_target integer,
  p_roll numeric, p_won boolean, p_bet numeric, p_payout numeric,
  p_multiplier numeric, p_chance numeric
) returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_balance numeric;
  v_banned boolean;
begin
  select balance, is_banned into v_balance, v_banned
    from public.users where id = p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if v_banned then raise exception 'USER_BANNED'; end if;
  if v_balance < p_bet then raise exception 'INSUFFICIENT_BALANCE'; end if;
  if p_bet <= 0 or p_payout < 0 or
    p_roll < 0 or p_roll >= 100 or p_target < 0 or p_target > 100 or
    p_mode not in ('higher', 'lower') or
    p_won is distinct from (case when p_mode = 'higher'
      then p_roll >= p_target else p_roll < p_target end)
  then raise exception 'INVALID_DICE_ROUND'; end if;
  if (not p_won and p_payout <> 0) then raise exception 'INVALID_DICE_PAYOUT'; end if;

  insert into public.dice_rounds
    (id, user_id, mode, target, roll, won, bet, payout, multiplier, chance_percent)
  values
    (p_id, p_user_id, p_mode, p_target, p_roll, p_won, p_bet, p_payout,
     p_multiplier, p_chance);

  update public.users set balance = balance - p_bet + p_payout
    where id = p_user_id returning balance into v_balance;
  return v_balance;
end;
$$;
revoke execute on function public.dice_play_atomic(uuid,bigint,text,integer,numeric,boolean,numeric,numeric,numeric,numeric)
from public, anon, authenticated;
grant execute on function public.dice_play_atomic(uuid,bigint,text,integer,numeric,boolean,numeric,numeric,numeric,numeric)
to service_role;

create or replace function public.dice_admin_overview()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  with aggregate_all as (
    select count(*) as total_rounds,
      count(*) filter (where won) as winning_rounds,
      count(distinct user_id) as unique_players,
      coalesce(sum(bet),0) as wagered,
      coalesce(sum(payout),0) as paid,
      coalesce(avg(bet),0) as average_bet
    from public.dice_rounds
  ), aggregate_today as (
    select count(*) as rounds,
      coalesce(sum(bet),0) as wagered,
      coalesce(sum(payout),0) as paid
    from public.dice_rounds
    where (created_at at time zone 'Asia/Tashkent')::date =
          (now() at time zone 'Asia/Tashkent')::date
  )
  select jsonb_build_object(
    'totalRounds', a.total_rounds,
    'winningRounds', a.winning_rounds,
    'uniquePlayers', a.unique_players,
    'totalWagered', a.wagered,
    'totalPaid', a.paid,
    'netProfit', a.wagered-a.paid,
    'averageBet', round(a.average_bet,2),
    'todayRounds', t.rounds,
    'todayWagered', t.wagered,
    'todayNet', t.wagered-t.paid,
    'recent', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select d.id, d.user_id, coalesce(nullif(u.first_name,''),u.username,'Player') as player,
          d.mode, d.target, d.roll, d.won, d.bet, d.payout,
          d.created_at
        from public.dice_rounds d
        left join public.users u on u.id = d.user_id
        order by d.created_at desc limit 25
      ) x
    ),'[]'::jsonb)
  )
  from aggregate_all a cross join aggregate_today t;
$$;
revoke execute on function public.dice_admin_overview() from public, anon, authenticated;
grant execute on function public.dice_admin_overview() to service_role;
