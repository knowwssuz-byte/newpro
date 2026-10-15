
-- NEW PRO: faster referral overview + capped deposit bonus codes
create index if not exists referrals_inviter_joined_fast_idx on public.referrals(inviter_id, joined_at desc);
create index if not exists referral_rewards_user_role_fast_idx on public.referral_rewards(user_id, role);

create or replace function public.referral_overview_fast(p_user_id bigint)
returns jsonb language sql stable set search_path = '' as $fn$
with rstats as (
  select count(*)::bigint total,
    count(*) filter (where status in ('active', 'rewarded'))::bigint active
  from public.referrals where inviter_id = p_user_id
), earnings as (
  select coalesce(sum(amount),0)::numeric earned
  from public.referral_rewards where user_id = p_user_id and role = 'inviter'
), friends as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'userId',r.invited_id,'firstName',coalesce(u.first_name,''),
    'username',coalesce(u.username,''),'status',coalesce(r.status,'joined'),
    'joinedAt',r.joined_at,'activatedAt',r.activated_at,'rewardedAt',r.rewarded_at,
    'rewardAmount',coalesce(r.inviter_reward_amount,0)
  ) order by r.joined_at desc), '[]'::jsonb) as items
  from (select * from public.referrals where inviter_id=p_user_id order by joined_at desc limit 50) r
  left join public.users u on u.id=r.invited_id
)
select jsonb_build_object(
 'settings',jsonb_build_object(
  'enabled', coalesce((select enabled from public.referral_settings where id=1), true),
  'inviterReward',coalesce((select inviter_reward from public.referral_settings where id=1),0),
  'inviteeReward',coalesce((select invitee_reward from public.referral_settings where id=1),0),
  'activationMode',coalesce((select activation_mode from public.referral_settings where id=1),'first_paid_activity')
 ),
 'stats',jsonb_build_object(
  'total',rs.total,'active',rs.active,'pending',greatest(0,rs.total-rs.active),
  'earned',e.earned,
  'conversionRate',case when rs.total>0 then round(rs.active::numeric*100/rs.total,1) else 0 end
 ),
 'friends', f.items,
 'invitedBy',(select jsonb_build_object('userId', inviter_id,'status', status,'joinedAt',joined_at)
       from public.referrals where invited_id=p_user_id limit 1)
)
from rstats rs cross join earnings e cross join friends f;
$fn$;
revoke all on function public.referral_overview_fast(bigint) from public, anon, authenticated;
grant execute on function public.referral_overview_fast(bigint) to service_role;

create table if not exists public.deposit_promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{4,32}$'),
  bonus_percent numeric(5,2) not null check(bonus_percent>0 and bonus_percent<=100),
  max_users integer not null check(max_users>=1),
  min_credit numeric(18,2) not null default 0 check(min_credit>=0),
  enabled boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.deposit_promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references public.deposit_promo_codes(id),
  user_id bigint not null references public.users(id),
  deposit_id uuid not null unique references public.deposit_transactions(id),
  status text not null default 'reserved' check(status in ('reserved','completed')),
  bonus_percent numeric(5,2) not null,
  bonus_amount numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(promo_id,user_id)
);
create index if not exists deposit_promo_redemptions_promo_idx on public.deposit_promo_redemptions(promo_id, status);
alter table public.deposit_promo_codes enable row level security;
alter table public.deposit_promo_redemptions enable row level security;
revoke all on table public.deposit_promo_codes, public.deposit_promo_redemptions from anon, authenticated;
grant select,insert,update,delete on table public.deposit_promo_codes, public.deposit_promo_redemptions to service_role;

create or replace function public.deposit_promo_reserve()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_code text; v_promo public.deposit_promo_codes%rowtype; v_uses bigint;
begin
  v_code := upper(btrim(coalesce(new.metadata->>'promoCode','')));
  if v_code = '' then return new; end if;
  if new.method not in ('stars','ton') then
    raise exception 'PROMO_METHOD_INVALID';
  end if;
  select * into v_promo from public.deposit_promo_codes where code=v_code for update;
  if not found or not v_promo.enabled or (v_promo.expires_at is not null and v_promo.expires_at <= now()) then
    raise exception 'PROMO_INVALID';
  end if;
  if new.credit_amount < v_promo.min_credit then raise exception 'PROMO_MIN_CREDIT'; end if;
  if exists(select 1 from public.deposit_promo_redemptions where promo_id=v_promo.id and user_id=new.user_id) then
    raise exception 'PROMO_ALREADY_USED';
  end if;
  select count(*) into v_uses from public.deposit_promo_redemptions where promo_id=v_promo.id;
  if v_uses >= v_promo.max_users then raise exception 'PROMO_LIMIT_REACHED'; end if;
  insert into public.deposit_promo_redemptions(promo_id,user_id,deposit_id,bonus_percent)
  values (v_promo.id,new.user_id,new.id,v_promo.bonus_percent);
  return new;
end;
$fn$;
revoke all on function public.deposit_promo_reserve() from public, anon, authenticated;

create or replace function public.deposit_promo_settle()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_bonus numeric(18,2);
begin
  if old.status = new.status then return new; end if;
  if new.status='completed' then
    update public.deposit_promo_redemptions
    set status='completed',
        bonus_amount=floor(greatest(0,new.credit_amount)*bonus_percent/100),
        completed_at=now()
    where deposit_id=new.id and status='reserved'
    returning bonus_amount into v_bonus;
    if found and v_bonus>0 then
      update public.users set balance=balance+v_bonus,updated_at=now() where id=new.user_id;
    end if;
  elsif new.status in ('cancelled','expired','rejected') then
    delete from public.deposit_promo_redemptions where deposit_id=new.id and status='reserved';
  end if;
  return new;
end;
$fn$;
revoke all on function public.deposit_promo_settle() from public, anon, authenticated;

drop trigger if exists deposit_promo_reserve_on_insert on public.deposit_transactions;
create trigger deposit_promo_reserve_on_insert after insert on public.deposit_transactions
for each row execute function public.deposit_promo_reserve();
drop trigger if exists deposit_promo_settle_on_status on public.deposit_transactions;
create trigger deposit_promo_settle_on_status after update of status on public.deposit_transactions
for each row execute function public.deposit_promo_settle();
