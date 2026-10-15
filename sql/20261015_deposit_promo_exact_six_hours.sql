-- Use one authoritative timestamp for both fields: exactly six hours.
create or replace function public.deposit_promo_access(
  p_code text, p_user_id bigint, p_credit_amount numeric, p_method text, p_activate boolean default false
)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
  v_code text := upper(btrim(coalesce(p_code,'')));
  v_promo public.deposit_promo_codes%rowtype;
  v_activation public.deposit_promo_activations%rowtype;
  v_uses bigint;
  v_remaining integer;
  v_expires timestamptz;
  v_started_at timestamptz;
begin
  if v_code !~ '^[A-Z0-9_-]{4,32}$' then raise exception 'PROMO_INVALID'; end if;
  if p_method not in ('stars','ton') then raise exception 'PROMO_METHOD_INVALID'; end if;
  if p_credit_amount is null or p_credit_amount<=0 then raise exception 'PROMO_AMOUNT_INVALID'; end if;
  select * into v_promo from public.deposit_promo_codes where code=v_code for update;
  if not found or not v_promo.enabled or
     (v_promo.expires_at is not null and v_promo.expires_at<=clock_timestamp())
     then raise exception 'PROMO_INVALID'; end if;
  if p_credit_amount < v_promo.min_credit then raise exception 'PROMO_MIN_CREDIT:%',v_promo.min_credit; end if;
  -- Resolves orphaned unpaid reservations before quota calculation.
  perform public.deposit_promo_cleanup();
  if exists(select 1 from public.deposit_promo_redemptions
     where promo_id=v_promo.id and user_id=p_user_id)
  then raise exception 'PROMO_ALREADY_USED'; end if;
  select count(*) into v_uses from public.deposit_promo_redemptions where promo_id=v_promo.id;
  if v_uses>=v_promo.max_users then raise exception 'PROMO_LIMIT_REACHED'; end if;
  select * into v_activation from public.deposit_promo_activations
    where promo_id=v_promo.id and user_id=p_user_id;
  if not found then
    if not p_activate then raise exception 'PROMO_NOT_ACTIVATED'; end if;
    v_started_at := clock_timestamp();
    insert into public.deposit_promo_activations(promo_id,user_id,activated_at,expires_at)
    values(v_promo.id,p_user_id,v_started_at,v_started_at + interval '6 hours')
    returning * into v_activation;
  end if;
  v_expires := least(v_activation.expires_at,coalesce(v_promo.expires_at,'infinity'::timestamptz));
  if v_expires<=clock_timestamp() then raise exception 'PROMO_WINDOW_EXPIRED'; end if;
  v_remaining := greatest(0,v_promo.max_users-v_uses);
  return jsonb_build_object(
    'code',v_promo.code,'bonusPercent',v_promo.bonus_percent,
    'minCredit',v_promo.min_credit,'remaining',v_remaining,
    'activatedAt',v_activation.activated_at,'expiresAt',v_expires,
    'expectedBonus',floor(p_credit_amount*v_promo.bonus_percent/100),
    'serverNow',clock_timestamp()
  );
end;
$fn$;

revoke all on function public.deposit_promo_access(text,bigint,numeric,text,boolean) from public,anon,authenticated;
grant execute on function public.deposit_promo_access(text,bigint,numeric,text,boolean) to service_role;
