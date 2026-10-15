
-- Release safety: balance ledger and consistent promo slot allocation.
create table if not exists public.balance_adjustment_ledger (
 id uuid primary key default gen_random_uuid(),
 operation_id uuid not null unique,
 user_id bigint not null references public.users(id),
 delta numeric not null,
 balance_after numeric not null,
 reason text not null default 'admin',
 created_at timestamptz not null default now()
);
create index if not exists balance_adjustment_ledger_user_idx on public.balance_adjustment_ledger(user_id, created_at desc);
alter table public.balance_adjustment_ledger enable row level security;
revoke all on table public.balance_adjustment_ledger from anon, authenticated;
grant select,insert to service_role on table public.balance_adjustment_ledger;

create or replace function public.admin_balance_adjust_atomic(
 p_user_id bigint, p_delta numeric, p_operation_id uuid, p_reason text default 'admin'
)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_user public.users%rowtype; v_previous public.balance_adjustment_ledger%rowtype;
begin
 if p_operation_id is null or p_user_id is null or
    p_delta is null or p_delta=0 or p_delta<>trunc(p_delta)
    or abs(p_delta)>1000000 then raise exception 'INVALID_BALANCE_ADJUSTMENT'; end if;
 select * into v_user from public.users where id=p_user_id for update;
 if not found then raise exception 'USER_NOT_FOUND'; end if;
 select * into v_previous from public.balance_adjustment_ledger where operation_id=p_operation_id;
 if found then
   if v_previous.user_id<>p_user_id or v_previous.delta<>p_delta then raise exception 'OPERATION_REUSED'; end if;
   return jsonb_build_object('id',p_user_id,'balance',v_previous.balance_after,'alreadyApplied',true);
 end if;
 if v_user.balance+p_delta<0 then raise exception 'INSUFFICIENT_BALANCE'; end if;
 update public.users set balance=balance+p_delta, updated_at=now() where id=p_user_id returning * into v_user;
 insert into public.balance_adjustment_ledger(operation_id,user_id,delta,balance_after,reason)
 values(p_operation_id,p_user_id,p_delta,v_user.balance,left(coalesce(p_reason,'admin'),120));
 return jsonb_build_object('id',v_user.id,'balance',v_user.balance,'alreadyApplied',false);
end;
$fn$;
revoke all on function public.admin_balance_adjust_atomic(bigint,numeric,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_balance_adjust_atomic(bigint,numeric,uuid,text) to service_role;

create table if not exists public.bonus_claim_ledger (
 id uuid primary key default gen_random_uuid(),
 user_id bigint not null references public.users(id),
 task_id text not null,
 reward integer not null check (reward>0),
 balance_after numeric not null,
 claimed_at timestamptz not null default now(),
 unique(user_id,task_id)
);
create index if not exists bonus_claim_ledger_user_idx on public.bonus_claim_ledger(user_id,claimed_at desc);
alter table public.bonus_claim_ledger enable row level security;
revoke all on table public.bonus_claim_ledger from anon,authenticated;
grant select,insert to service_role on table public.bonus_claim_ledger;

create or replace function public.bonus_claim_atomic(p_user_id bigint, p_task_id text, p_reward integer)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_claim public.bonus_claim_ledger%rowtype; v_balance numeric; v_legacy jsonb; v_progress jsonb;
begin
 if p_user_id is null or p_task_id !~ '^[A-Za-z0-9_-]{1,72}$'
    or p_reward is null or p_reward<1 or p_reward>100000 then
      raise exception 'INVALID_BONUS_CLAIM';
 end if;
 perform 1 from public.users where id=p_user_id and coalesce(is_banned,false)=false for update;
 if not found then raise exception 'USER_NOT_FOUND_OR_BANNED'; end if;
 select * into v_claim from public.bonus_claim_ledger where user_id=p_user_id and task_id=p_task_id;
 if found then
  return jsonb_build_object('reward',v_claim.reward,'balance',v_claim.balance_after,'alreadyClaimed',true);
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
 return jsonb_build_object('reward',p_reward,'balance',v_balance,'alreadyClaimed',false);
end;
$fn$;
revoke all on function public.bonus_claim_atomic(bigint,text,integer) from public,anon,authenticated;
grant execute on function public.bonus_claim_atomic(bigint,text,integer) to service_role;

-- An applied promo occupies a slot until its six-hour window expires. Once a
-- deposit uses the promo, its slot remains consumed for its lifetime.
create or replace function public.deposit_promo_access(
 p_code text, p_user_id bigint, p_credit_amount numeric, p_method text, p_activate boolean default false
)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 v_code text:=upper(btrim(coalesce(p_code,'')));
 v_promo public.deposit_promo_codes%rowtype;
 v_activation public.deposit_promo_activations%rowtype;
 v_occupied integer;
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
 if p_credit_amount < v_promo.min_credit then raise exception 'PROMO_MIN_CREDIT'; end if;
 perform public.deposit_promo_cleanup();
 if exists(select 1 from public.deposit_promo_redemptions where promo_id=v_promo.id and user_id=p_user_id)
 then raise exception 'PROMO_ALREADY_USED'; end if;
 select * into v_activation from public.deposit_promo_activations
  where promo_id=v_promo.id and user_id=p_user_id;
 if found and v_activation.expires_at<=clock_timestamp() then raise exception 'PROMO_WINDOW_EXPIRED'; end if;
 -- Distinct users across active applied codes and reserved/completed deposits.
 select count(*) into v_occupied from (
  select a.user_id from public.deposit_promo_activations a
  where a.promo_id=v_promo.id and a.expires_at>clock_timestamp()
  union
  select r.user_id from public.deposit_promo_redemptions r where r.promo_id=v_promo.id
 ) occupied;
 if not found and v_occupied>=v_promo.max_users then raise exception 'PROMO_LIMIT_REACHED'; end if;
 if v_activation.id is null then
  if not p_activate then raise exception 'PROMO_NOT_ACTIVATED'; end if;
  if v_occupied>=v_promo.max_users then raise exception 'PROMO_LIMIT_REACHED'; end if;
  v_started_at:=clock_timestamp();
  insert into public.deposit_promo_activations(promo_id,user_id,activated_at,expires_at)
  values(v_promo.id,p_user_id,v_started_at,v_started_at+interval '6 hours')
  returning * into v_activation;
  v_occupied:=v_occupied+1;
 end if;
 v_expires:=least(v_activation.expires_at,coalesce(v_promo.expires_at,'infinity'::timestamptz));
 if v_expires<=clock_timestamp() then raise exception 'PROMO_WINDOW_EXPIRED'; end if;
 return jsonb_build_object(
  'code',v_promo.code,'bonusPercent',v_promo.bonus_percent,
  'minCredit',v_promo.min_credit,'remaining',greatest(0,v_promo.max_users-v_occupied),
  'activatedAt',v_activation.activated_at,'expiresAt',v_expires,
  'expectedBonus',floor(p_credit_amount*v_promo.bonus_percent/100),
  'serverNow',clock_timestamp()
 );
end;
$fn$;
revoke all on function public.deposit_promo_access(text,bigint,numeric,text,boolean) from public,anon,authenticated;
grant execute on function public.deposit_promo_access(text,bigint,numeric,text,boolean) to service_role;

create index if not exists deposit_promo_redemptions_user_idx
  on public.deposit_promo_redemptions(user_id);
create index if not exists rocket_game_round_plans_round_idx
  on public.rocket_game_round_plans(round_id);
drop index if exists public.referrals_inviter_joined_fast_idx;
