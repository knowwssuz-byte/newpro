-- NewPro: unlimited free case availability; one free opening per user per rolling 24 hours.
-- Must have claimed an active Telegram channel bonus task; server separately rechecks live membership.
DO $migration$
DECLARE
  v_definition text := pg_get_functiondef('public.open_case_atomic(bigint,uuid)'::regprocedure);
  v_anchor text := '    IF v_balance_before < v_case_price THEN';
  v_guard text := $guard$
    -- FREE_CASE_POLICY_20261031: executed inside the user-row lock and atomic prize transaction.
    IF v_case_price = 0 THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.bonus_claim_ledger claim
            JOIN public.app_settings config ON config.key = 'bonus_tasks_v1'
            CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(config.value->'tasks') = 'array'
                     THEN config.value->'tasks' ELSE '[]'::jsonb END
            ) task(task_item)
            WHERE claim.user_id = p_user_id
              AND claim.task_id = task.task_item->>'id'
              AND task.task_item->>'type' = 'telegram_channel'
              AND coalesce(task.task_item->>'isActive','true') <> 'false'
              AND nullif(btrim(coalesce(task.task_item->>'chatId','')), '') IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'FREE_CASE_TASK_REQUIRED';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.open_history history
            JOIN public.cases previous_case ON previous_case.id = history.case_id
            WHERE history.user_id = p_user_id
              AND previous_case.price = 0
              AND history.created_at > now() - interval '24 hours'
        ) THEN
            RAISE EXCEPTION 'FREE_CASE_COOLDOWN_24H';
        END IF;
    END IF;

$guard$;
BEGIN
  IF strpos(v_definition, 'FREE_CASE_POLICY_20261031') > 0 THEN
    RETURN;
  END IF;
  IF strpos(v_definition, v_anchor) = 0 OR
     strpos(v_definition, 'FOR UPDATE;') = 0 OR
     strpos(v_definition, 'INSERT INTO public.open_history') = 0 THEN
    RAISE EXCEPTION 'Unexpected open_case_atomic version; free-case guard not applied';
  END IF;
  EXECUTE replace(v_definition, v_anchor, v_guard || v_anchor);
END $migration$;

REVOKE EXECUTE ON FUNCTION public.open_case_atomic(bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_case_atomic(bigint,uuid) TO service_role;

UPDATE public.cases
SET badge_text = 'UNLIMITED', updated_at = now()
WHERE lower(btrim(title)) = 'all free' AND price = 0 AND archived_at IS NULL;
