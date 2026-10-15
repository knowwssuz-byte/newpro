
-- A promo is active for the specific account for six hours from the first "Apply".
-- Re-applying never extends the window. Created payment intents retain their bonus.
create table if not exists public.deposit_promo_activations (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references public.deposit_promo_codes(id),
  user_id bigint not null references public.users(id),
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (promo_id, user_id),
  constraint promo_6h_window check (expires_at > activated_at and expires_at <= activated_at + interval '6 hours')
);
create index if not exists deposit_promo_activations_user_idx
  on public.deposit_promo_activations(user_id, expires_at desc);
alter table public.deposit_promo_activations enable row level security;
revoke all on table public.deposit_promo_activations from public, anon, authenticated;
grant select,insert,update,delete on table public.deposit_promo_activations to service_role;

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
    insert into public.deposit_promo_activations(promo_id,user_id,activated_at,expires_at)
    values(v_promo.id,p_user_id,clock_timestamp(),clock_timestamp() + interval '6 hours')
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

create or replace function public.deposit_promo_reserve()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare
  v_code text;
  v_promo public.deposit_promo_codes%rowtype;
  v_activation public.deposit_promo_activations%rowtype;
  v_uses bigint;
begin
  v_code := upper(btrim(coalesce(new.metadata->>'promoCode','')));
  if v_code='' then return new; end if;
  if new.method not in ('stars','ton') then raise exception 'PROMO_METHOD_INVALID'; end if;
  select * into v_promo from public.deposit_promo_codes where code=v_code for update;
  if not found or not v_promo.enabled or
    (v_promo.expires_at is not null and v_promo.expires_at<=clock_timestamp())
  then raise exception 'PROMO_INVALID'; end if;
  select * into v_activation from public.deposit_promo_activations
  where promo_id=v_promo.id and user_id=new.user_id;
  if not found then raise exception 'PROMO_NOT_ACTIVATED'; end if;
  if v_activation.expires_at<=clock_timestamp() then raise exception 'PROMO_WINDOW_EXPIRED'; end if;
  if new.credit_amount<v_promo.min_credit then raise exception 'PROMO_MIN_CREDIT'; end if;
  if exists(select 1 from public.deposit_promo_redemptions where promo_id=v_promo.id and user_id=new.user_id)
    then raise exception 'PROMO_ALREADY_USED'; end if;
  select count(*) into v_uses from public.deposit_promo_redemptions where promo_id=v_promo.id;
  if v_uses>=v_promo.max_users then raise exception 'PROMO_LIMIT_REACHED'; end if;
  insert into public.deposit_promo_redemptions(promo_id,user_id,deposit_id,bonus_percent)
  values(v_promo.id,new.user_id,new.id,v_promo.bonus_percent);
  return new;
end;
$fn$;
revoke all on function public.deposit_promo_reserve() from public,anon,authenticated;
-- Trigger executes as database owner; direct execution is unnecessary.

-- Existing reserved invoices remain eligible after the six-hour window, because
-- their deposit creation already succeeded within the window.
