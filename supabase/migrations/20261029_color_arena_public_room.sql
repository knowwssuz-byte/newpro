-- Permanent public COLOR ARENA. This is a nonredeemable virtual-credit game.
-- The pre-existing room is reused so historical wins and transactions are preserved.
alter table public.color_arena_rooms add column if not exists is_public boolean not null default false;
alter table public.color_arena_rooms alter column max_players drop not null;
alter table public.color_arena_rooms drop constraint if exists color_arena_rooms_max_players_check;
alter table public.color_arena_rooms add constraint color_arena_rooms_max_players_check
  check ((is_public and max_players is null) or (not is_public and max_players between 2 and 8));
alter table public.color_arena_bets drop constraint if exists color_arena_bets_seat_check;
alter table public.color_arena_bets add constraint color_arena_bets_seat_check check(seat>=0);
create unique index if not exists color_arena_one_public_room on public.color_arena_rooms(is_public) where is_public;
do $select_public$
declare v_room uuid; v_owner bigint;
begin
  if exists(select 1 from public.color_arena_rooms where is_public) then return; end if;
  -- Prefer an empty waiting arena, preserving its ID and past match history.
  select r.id into v_room from public.color_arena_rooms r
    where r.status='WAITING' and r.total_stake=0
    order by r.created_at asc limit 1 for update;
  if v_room is not null then
    update public.color_arena_rooms set is_public=true,max_players=null,min_stake=10,
      updated_at=now(),version=version+1 where id=v_room;
  else
    select u.id into v_owner from public.users u where not u.is_banned order by u.created_at limit 1;
    if v_owner is null then raise exception 'COLOR_ARENA_NO_OWNER'; end if;
    insert into public.color_arena_rooms(owner_id,is_public,max_players,min_stake)
      values(v_owner,true,null,10);
  end if;
end $select_public$;

-- Fast authoritative snapshot. All round participants are returned, regardless of
-- the Supabase Data API row limit. The client only displays a short leaderboard.
create or replace function public.color_arena_public_players(p_round uuid)
returns jsonb language sql stable security invoker set search_path='' as $public_players$
select coalesce(jsonb_agg(jsonb_build_object(
  'id',b.user_id,'seat',b.seat,'stake',b.stake,
  'name',left(coalesce(nullif(u.first_name,''),nullif(u.username,''),'Player'),24)
) order by b.seat),'[]'::jsonb)
from public.color_arena_bets b join public.users u on u.id=b.user_id
where b.round_id=p_round;
$public_players$;
revoke all on function public.color_arena_public_players(uuid) from public,anon,authenticated;
grant execute on function public.color_arena_public_players(uuid) to service_role;

-- Optimize resolution for many thousands of players: one ordered cursor,
-- rather than a new SELECT for every neighbor.
create or replace function public.color_arena_finish(p_room uuid,p_round uuid,p_x numeric,p_y numeric)
returns bigint language plpgsql security invoker set search_path='' as $finish_public$
declare v public.color_arena_rooms%rowtype;
        r record; v_total numeric:=0; v_cut numeric; v_amp numeric;
        v_phase numeric; v_frequency integer; v_winner bigint;
begin
  select * into v from public.color_arena_rooms where id=p_room for update;
  if not found then raise exception 'ARENA_NO_ROOM'; end if;
  if v.round_id<>p_round then raise exception 'ARENA_STALE_ROUND'; end if;
  if v.status='RESULT' then return v.winner_id; end if;
  if v.status<>'ROLLING' or clock_timestamp()<v.roll_ends_at then
    raise exception 'ARENA_NOT_FINISHABLE'; end if;
  if p_x is null or p_y is null or p_x<>v.finish_x or p_y<>v.finish_y
    or p_x<0 or p_x>=1 or p_y<0 or p_y>=1 then raise exception 'ARENA_INVALID_POINT'; end if;
  v_frequency:=1+(v.seed%2);
  v_phase:=(v.seed%360)::numeric/360;
  for r in select b.user_id,b.stake,b.seat,
           lead(b.stake) over (order by b.seat) as next_stake,
           row_number() over (order by b.seat) as rn
           from public.color_arena_bets b where b.round_id=v.round_id order by b.seat
  loop
    v_total:=v_total+r.stake::numeric/v.total_stake;
    if r.next_stake is null then v_winner:=r.user_id;exit;end if;
    v_amp:=least(r.stake,r.next_stake)::numeric/v.total_stake*0.12;
    v_cut:=v_total+v_amp*sin(2*pi()*(v_frequency*p_y+v_phase+r.rn*0.37));
    if p_x<v_cut then v_winner:=r.user_id;exit;end if;
  end loop;
  if v_winner is null then raise exception 'ARENA_INVALID_GEOMETRY'; end if;
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
end $finish_public$;
