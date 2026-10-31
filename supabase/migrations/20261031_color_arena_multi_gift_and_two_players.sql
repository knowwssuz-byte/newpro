-- Color Arena: atomically stake 1–10 owned gifts; 2 DISTINCT entrants required to roll or settle.
-- Keeps the existing escrow, account locks, server valuation and refund logic.
CREATE OR REPLACE FUNCTION public.color_arena_stake_gifts(
 p_room uuid,p_user bigint,p_histories uuid[],p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $batch$
DECLARE
  v_count integer;
  v_unique_count integer;
  v_history uuid;
  v_item jsonb;
  v_total bigint := 0;
  v_entries jsonb := '[]'::jsonb;
  v_request uuid;
BEGIN
  IF p_request IS NULL OR p_room IS NULL OR p_user IS NULL OR p_histories IS NULL THEN
    RAISE EXCEPTION 'ARENA_INVALID_ENTRY';
  END IF;
  v_count := cardinality(p_histories);
  SELECT count(DISTINCT gift_id) INTO v_unique_count FROM unnest(p_histories) AS ids(gift_id);
  IF v_count < 1 OR v_count > 10 OR v_count <> v_unique_count
     OR array_position(p_histories,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'ARENA_INVALID_ENTRY';
  END IF;
  -- Entire batch is one Postgres transaction. Any rejected gift rolls all back.
  -- Per-gift stable request IDs let a timed-out batch be retried safely.
  PERFORM pg_advisory_xact_lock(p_user);
  FOR v_history IN SELECT gift_id FROM unnest(p_histories) AS ids(gift_id) ORDER BY gift_id LOOP
    v_request := md5(p_request::text || ':' || v_history::text)::uuid;
    v_item := public.color_arena_stake_gift(p_room,p_user,v_history,v_request);
    v_total := v_total + (v_item->>'value')::bigint;
    v_entries := v_entries || jsonb_build_array(v_item);
  END LOOP;
  RETURN jsonb_build_object('count',v_count,'totalValue',v_total,'items',v_entries);
END $batch$;

REVOKE ALL ON FUNCTION public.color_arena_stake_gifts(uuid,bigint,uuid[],uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.color_arena_stake_gifts(uuid,bigint,uuid[],uuid)
 TO service_role;

DO $guards$
DECLARE
  v_sql text;
  v_anchor text;
  v_guard text;
BEGIN
  -- Defence in depth: never plan a target with fewer than two real entrants.
  v_sql:=pg_get_functiondef('public.color_arena_plan(uuid,uuid,numeric,numeric)'::regprocedure);
  v_anchor:='  if v.status<>''LOCKED'' or p_x is null';
  v_guard:='  -- ARENA_DISTINCT_PLAYER_GUARD_20261031
  if (select count(distinct user_id) from public.color_arena_bets
      where round_id=v.round_id) < 2 then
    raise exception ''ARENA_MIN_PLAYERS'';
  end if;
';
  IF position('ARENA_DISTINCT_PLAYER_GUARD_20261031' in v_sql)=0 THEN
    IF position(v_anchor in v_sql)=0 THEN RAISE EXCEPTION 'Unexpected arena plan version'; END IF;
    EXECUTE replace(v_sql,v_anchor,v_guard||v_anchor);
  END IF;

  -- Even an erroneously LOCKED old round cannot ever transfer Stars or gifts.
  v_sql:=pg_get_functiondef('public.color_arena_finish(uuid,uuid,numeric,numeric)'::regprocedure);
  v_anchor:='  if v.status<>''ROLLING'' or clock_timestamp()<v.roll_ends_at then';
  IF position('ARENA_DISTINCT_PLAYER_GUARD_20261031' in v_sql)=0 THEN
    IF position(v_anchor in v_sql)=0 THEN RAISE EXCEPTION 'Unexpected arena finish version'; END IF;
    EXECUTE replace(v_sql,v_anchor,v_guard||v_anchor);
  END IF;

  -- The waiting timer must only ever move to LOCKED for 2 distinct users.
  v_sql:=pg_get_functiondef('public.color_arena_tick(uuid)'::regprocedure);
  v_anchor:='select count(*) into v_count from public.color_arena_bets where round_id=v.round_id;';
  IF position('ARENA_DISTINCT_PLAYER_TICK_20261031' in v_sql)=0 THEN
    IF position(v_anchor in v_sql)=0 THEN RAISE EXCEPTION 'Unexpected arena tick version'; END IF;
    EXECUTE replace(v_sql,v_anchor,
      'select count(distinct user_id) into v_count from public.color_arena_bets where round_id=v.round_id; -- ARENA_DISTINCT_PLAYER_TICK_20261031');
  END IF;
END $guards$;
