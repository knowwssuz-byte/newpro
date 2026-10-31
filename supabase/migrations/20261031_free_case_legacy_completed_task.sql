-- Compatibility patch: allow completed channel tasks recorded before bonus_claim_ledger.
-- Award no extra Stars and retain live Telegram getChatMember + atomic 24h restriction.
DO $migration$
DECLARE
  v_definition text := pg_get_functiondef('public.open_case_atomic(bigint,uuid)'::regprocedure);
  v_marker integer;
  v_start integer;
  v_end integer;
  v_compat text := $guard$
        -- FREE_CASE_LEGACY_TASK_COMPAT_20261031: use the same completed status as Bonus UI.
        IF NOT EXISTS (
            SELECT 1
            FROM public.app_settings config
            CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(config.value->'tasks') = 'array'
                     THEN config.value->'tasks' ELSE '[]'::jsonb END
            ) task(task_item)
            WHERE config.key = 'bonus_tasks_v1'
              AND task.task_item->>'type' = 'telegram_channel'
              AND coalesce(task.task_item->>'isActive', 'true') <> 'false'
              AND nullif(btrim(coalesce(task.task_item->>'chatId','')), '') IS NOT NULL
              AND (
                EXISTS (
                    SELECT 1 FROM public.bonus_claim_ledger claim
                    WHERE claim.user_id = p_user_id
                      AND claim.task_id = task.task_item->>'id'
                )
                OR EXISTS (
                    SELECT 1 FROM public.app_settings progress
                    WHERE progress.key = 'bonus_progress_' || p_user_id::text || '_' || (task.task_item->>'id')
                      AND progress.value->>'status' = 'completed'
                )
                OR EXISTS (
                    SELECT 1 FROM public.app_settings legacy
                    WHERE legacy.key = 'bonus_claim_' || p_user_id::text || '_' || (task.task_item->>'id')
                )
              )
        ) THEN
            RAISE EXCEPTION 'FREE_CASE_TASK_REQUIRED';
        END IF;

$guard$;
BEGIN
  IF strpos(v_definition, 'FREE_CASE_LEGACY_TASK_COMPAT_20261031') > 0 THEN
    RETURN;
  END IF;
  v_marker := strpos(v_definition, 'FREE_CASE_POLICY_20261031');
  IF v_marker = 0 THEN
    RAISE EXCEPTION 'Missing initial free-case guard; refusing patch';
  END IF;
  v_start := v_marker + strpos(substr(v_definition, v_marker), '        IF NOT EXISTS (') - 1;
  v_end := v_marker + strpos(substr(v_definition, v_marker), '        IF EXISTS (') - 1;
  IF v_start < v_marker OR v_end <= v_start
    OR strpos(substr(v_definition, v_start, v_end-v_start), 'FREE_CASE_TASK_REQUIRED') = 0
    OR strpos(substr(v_definition, v_end), 'FREE_CASE_COOLDOWN_24H') = 0 THEN
    RAISE EXCEPTION 'Unexpected atomic free-case guard; refusing patch';
  END IF;
  EXECUTE substr(v_definition, 1, v_start-1) || v_compat || substr(v_definition, v_end);
END $migration$;

REVOKE EXECUTE ON FUNCTION public.open_case_atomic(bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_case_atomic(bigint,uuid) TO service_role;
