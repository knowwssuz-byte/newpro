-- NewPro: referral bonus for one completed task per referral.
-- Only service-role server code may call these privileged RPCs.
CREATE OR REPLACE FUNCTION public.referral_activate(p_invited_id bigint, p_event text, p_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_referral public.referrals%rowtype;
  v_settings public.referral_settings%rowtype;
  v_rows integer := 0;
  v_inviter_credited numeric := 0;
  v_invitee_credited numeric := 0;
begin
  if p_event not in ('paid_case', 'deposit', 'bonus_task') then
    raise exception 'REFERRAL_EVENT_INVALID';
  end if;

  select * into v_referral
  from public.referrals
  where invited_id = p_invited_id
  for update;

  if not found then
    return jsonb_build_object('activated', false, 'reason', 'not_referred');
  end if;

  if v_referral.status in ('active', 'rewarded') then
    return jsonb_build_object(
      'activated', true,
      'alreadyActivated', true,
      'status', v_referral.status
    );
  end if;

  select * into v_settings
  from public.referral_settings
  where id = 1;

  if not found or v_settings.enabled = false then
    return jsonb_build_object('activated', false, 'reason', 'disabled');
  end if;

  if v_settings.activation_mode = 'completed_task' and p_event <> 'bonus_task' then
    return jsonb_build_object('activated', false, 'reason', 'task_required');
  end if;
  if v_settings.activation_mode <> 'completed_task' and p_event = 'bonus_task' then
    return jsonb_build_object('activated', false, 'reason', 'mode_mismatch');
  end if;

  update public.referrals
  set
    status = 'active',
    activated_at = coalesce(activated_at, now()),
    activity_event = p_event,
    activity_reference = left(nullif(btrim(coalesce(p_reference, '')), ''), 200)
  where id = v_referral.id
  returning * into v_referral;

  if v_settings.inviter_reward > 0 then
    insert into public.referral_rewards (
      referral_id,
      user_id,
      role,
      amount,
      event,
      reference
    )
    values (
      v_referral.id::text,
      v_referral.inviter_id,
      'inviter',
      v_settings.inviter_reward,
      p_event,
      left(nullif(btrim(coalesce(p_reference, '')), ''), 200)
    )
    on conflict (referral_id, role) do nothing;

    get diagnostics v_rows = row_count;

    if v_rows = 1 then
      update public.users
      set balance = coalesce(balance, 0) + v_settings.inviter_reward
      where id = v_referral.inviter_id;

      v_inviter_credited := v_settings.inviter_reward;
    end if;
  end if;

  if v_settings.invitee_reward > 0 then
    insert into public.referral_rewards (
      referral_id,
      user_id,
      role,
      amount,
      event,
      reference
    )
    values (
      v_referral.id::text,
      v_referral.invited_id,
      'invitee',
      v_settings.invitee_reward,
      p_event,
      left(nullif(btrim(coalesce(p_reference, '')), ''), 200)
    )
    on conflict (referral_id, role) do nothing;

    get diagnostics v_rows = row_count;

    if v_rows = 1 then
      update public.users
      set balance = coalesce(balance, 0) + v_settings.invitee_reward
      where id = v_referral.invited_id;

      v_invitee_credited := v_settings.invitee_reward;
    end if;
  end if;

  update public.referrals
  set
    status = case
      when v_settings.inviter_reward > 0 or v_settings.invitee_reward > 0
        then 'rewarded'
      else 'active'
    end,
    rewarded_at = case
      when v_settings.inviter_reward > 0 or v_settings.invitee_reward > 0
        then coalesce(rewarded_at, now())
      else rewarded_at
    end,
    inviter_reward_amount = greatest(coalesce(inviter_reward_amount, 0), v_settings.inviter_reward),
    invitee_reward_amount = greatest(coalesce(invitee_reward_amount, 0), v_settings.invitee_reward)
  where id = v_referral.id
  returning * into v_referral;

  return jsonb_build_object(
    'activated', true,
    'alreadyActivated', false,
    'status', v_referral.status,
    'inviterCredited', v_inviter_credited,
    'inviteeCredited', v_invitee_credited
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.bonus_claim_atomic(p_user_id bigint, p_task_id text, p_reward integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_claim public.bonus_claim_ledger%rowtype; v_balance numeric; v_legacy jsonb; v_progress jsonb;
begin
 if p_user_id is null or p_task_id is null or p_task_id !~ '^[A-Za-z0-9_-]{1,72}$'
    or p_reward is null or p_reward<1 or p_reward>100000 then
      raise exception 'INVALID_BONUS_CLAIM';
 end if;
 perform 1 from public.users where id=p_user_id and coalesce(is_banned,false)=false for update;
 if not found then raise exception 'USER_NOT_FOUND_OR_BANNED'; end if;
 select * into v_claim from public.bonus_claim_ledger where user_id=p_user_id and task_id=p_task_id;
 if found then
  return jsonb_build_object('reward',v_claim.reward,'balance',(select balance from public.users where id=p_user_id),'alreadyClaimed',true);
 end if;
 select value into v_legacy from public.app_settings
  where key='bonus_claim_'||p_user_id::text||'_'||p_task_id;
 if v_legacy is not null then raise exception 'BONUS_LEGACY_REVIEW'; end if;
 select value into v_progress from public.app_settings
  where key='bonus_progress_'||p_user_id::text||'_'||p_task_id;
 if v_progress->>'status'='completed' then raise exception 'BONUS_ALREADY_COMPLETED'; end if;
 update public.users set balance=balance+p_reward,updated_at=now() where id=p_user_id returning balance into v_balance;
 insert into public.bonus_claim_ledger(user_id,task_id,reward,balance_after)
 values(p_user_id,p_task_id,p_reward,v_balance);
 -- Settle referral in the same transaction as the completed task.
 perform public.referral_activate(p_user_id, 'bonus_task', p_task_id);
 select balance into v_balance from public.users where id=p_user_id;
 return jsonb_build_object('reward',p_reward,'balance',v_balance,'alreadyClaimed',false);
end;
$function$;

UPDATE public.referral_settings SET activation_mode='completed_task',updated_at=now() WHERE id=1;

REVOKE ALL ON FUNCTION public.referral_activate(bigint,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bonus_claim_atomic(bigint,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.referral_activate(bigint,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bonus_claim_atomic(bigint,text,integer) TO service_role;
