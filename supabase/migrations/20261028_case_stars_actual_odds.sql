-- Case and Stars actual odds: preserve atomic opening and service-role-only RPC.
-- The former function weighted prizes by visible chance even when real_chance
-- was zero. Use real_chance for the random draw and disclosed odds instead.
DO $block$
DECLARE
  definition text := pg_get_functiondef('public.open_case_atomic(bigint,uuid)'::regprocedure);
BEGIN
  IF strpos(definition, 'COALESCE(SUM(real_chance), 0)') > 0 THEN
    RETURN;
  END IF;
  IF strpos(definition, 'COALESCE(SUM(chance), 0)') = 0 OR
     strpos(definition, 'AND chance > 0') = 0 OR
     strpos(definition, 'AND g.chance > 0') = 0 OR
     strpos(definition, 'SUM(g.chance) OVER') = 0 OR
     strpos(definition, 'ORDER BY g.chance DESC') = 0 THEN
    RAISE EXCEPTION 'Unexpected open_case_atomic version; aborting chance patch';
  END IF;
  definition := replace(definition, 'COALESCE(SUM(chance), 0)', 'COALESCE(SUM(real_chance), 0)');
  definition := replace(definition, 'AND chance > 0', 'AND real_chance > 0');
  definition := replace(definition, 'AND g.chance > 0', 'AND g.real_chance > 0');
  definition := replace(definition, 'SUM(g.chance) OVER', 'SUM(g.real_chance) OVER');
  definition := replace(definition, 'ORDER BY g.chance DESC', 'ORDER BY g.real_chance DESC');
  definition := replace(definition, '''chance'', g.chance,', '''chance'', g.chance, ''real_chance'', g.real_chance,');
  definition := replace(definition, '''chance'', v_updated_gift.chance,', '''chance'', v_updated_gift.chance, ''real_chance'', v_updated_gift.real_chance,');
  EXECUTE definition;
END $block$;
REVOKE EXECUTE ON FUNCTION public.open_case_atomic(bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_case_atomic(bigint,uuid) TO service_role;
