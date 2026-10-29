-- Fix deadlocked public arena when betting expires with fewer than 2 players.
-- Requires existing gift escrow and ledger tables.
CREATE OR REPLACE FUNCTION public.color_arena_tick(p_room uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v public.color_arena_rooms%rowtype;v_count integer;v_bet record;v_gift_value bigint;v_stars bigint;
begin
  select * into v from public.color_arena_rooms where id=p_room for update;
  if not found then raise exception 'ARENA_NO_ROOM'; end if;
  if v.status='BETTING' and clock_timestamp()>=v.betting_ends_at then
    select count(*) into v_count from public.color_arena_bets where round_id=v.round_id;
    if v_count < 2 then
      -- Cancel expired round with fewer than two players atomically.
      -- Refund only originally debited Stars, never mint gift face value.
      for v_bet in select user_id,stake from public.color_arena_bets
        where round_id=v.round_id order by user_id for update loop
        select coalesce(sum(value_stars),0) into v_gift_value
          from public.color_arena_gift_stakes
          where round_id=v.round_id and owner_id=v_bet.user_id and status='locked';
        v_stars:=v_bet.stake-v_gift_value;
        if v_stars<0 then raise exception 'ARENA_INVALID_POT';end if;
        if v_stars>0 then
          update public.users set balance=balance+v_stars,updated_at=now()
            where id=v_bet.user_id;
          if not found then raise exception 'ARENA_NO_USER';end if;
          insert into public.color_arena_stars_ledger(user_id,room_id,round_id,kind,amount)
            values(v_bet.user_id,v.id,v.round_id,'refund',v_stars);
        end if;
      end loop;
      update public.color_arena_gift_stakes set status='refunded',
        settled_at=clock_timestamp() where round_id=v.round_id and status='locked';
      delete from public.color_arena_bets where round_id=v.round_id;
      update public.color_arena_rooms set status='WAITING',total_stake=0,
        round_id=gen_random_uuid(),round_no=round_no+1,
        seed=floor(random()*1000000)::integer,
        betting_ends_at=null,rolling_at=null,roll_ends_at=null,
        result_ends_at=null,winner_id=null,finish_x=null,finish_y=null,
        snapshot='[]'::jsonb,version=version+1,updated_at=now()
        where id=v.id;
      insert into public.color_arena_events(room_id) values(v.id);
      return 'WAITING';
    end if;
    update public.color_arena_rooms set status='LOCKED',
      snapshot=(select jsonb_agg(jsonb_build_object('user_id',b.user_id,'stake',b.stake,'seat',b.seat) order by b.seat)
        from public.color_arena_bets b where b.round_id=v.round_id),
      rolling_at=clock_timestamp()+interval '1 second',
      roll_ends_at=clock_timestamp()+interval '11 seconds',
      version=version+1,updated_at=now() where id=p_room;
    insert into public.color_arena_events(room_id) values(p_room);
    return 'LOCKED';
  end if;
  if v.status='LOCKED' and v.finish_x is not null and v.finish_y is not null
     and clock_timestamp()>=v.rolling_at then
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
end $function$;

revoke execute on function public.color_arena_tick(uuid) from public,anon,authenticated;
grant execute on function public.color_arena_tick(uuid) to service_role;
