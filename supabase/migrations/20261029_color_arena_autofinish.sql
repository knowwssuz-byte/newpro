-- Background fallback to progress rounds even when every client disconnects.
-- User-facing API continues to advance sub-second on demand; this is recovery safety.
create extension if not exists pg_cron with schema pg_catalog;
create or replace function public.color_arena_housekeeping()
returns integer language plpgsql security invoker set search_path = '' as $housekeeping$
declare r public.color_arena_rooms%rowtype;
  v_hex text; v_x numeric; v_y numeric; v_count integer:=0;
begin
  for r in select * from public.color_arena_rooms
    where status in ('BETTING','LOCKED','ROLLING','RESULT')
    order by updated_at asc limit 128 loop
    begin
      perform public.color_arena_tick(r.id);
      select * into r from public.color_arena_rooms where id=r.id;
      if r.status='LOCKED' and r.finish_x is null then
        -- gen_random_uuid uses cryptographically secure randomness.
        v_hex:=replace(gen_random_uuid()::text,'-','');
        v_x:=least(0.9999999999,('x'||substr(v_hex,1,8))::bit(32)::bigint/4294967296.0);
        v_y:=least(0.9999999999,('x'||substr(v_hex,9,8))::bit(32)::bigint/4294967296.0);
        perform public.color_arena_plan(r.id,r.round_id,v_x,v_y);
      end if;
      perform public.color_arena_tick(r.id);
      select * into r from public.color_arena_rooms where id=r.id;
      if r.status='ROLLING' and clock_timestamp()>=r.roll_ends_at
         and r.finish_x is not null and r.finish_y is not null then
        perform public.color_arena_finish(r.id,r.round_id,r.finish_x,r.finish_y);
      end if;
      v_count:=v_count+1;
    exception when others then
      raise warning 'color_arena_housekeeping: room skipped (%): %', r.id, SQLSTATE;
    end;
  end loop;
  return v_count;
end $housekeeping$;
revoke execute on function public.color_arena_housekeeping() from public,anon,authenticated;
grant execute on function public.color_arena_housekeeping() to service_role;
select cron.schedule('color-arena-autofinish-10s','10 seconds','select public.color_arena_housekeeping()');
