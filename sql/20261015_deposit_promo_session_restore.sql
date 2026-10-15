create or replace function public.deposit_promo_current(p_user_id bigint)
returns jsonb language sql stable security definer set search_path='' as $fn$
select jsonb_build_object(
 'code',c.code,'bonusPercent',c.bonus_percent,
 'minCredit',c.min_credit,'activatedAt',a.activated_at,
 'expiresAt',least(a.expires_at,coalesce(c.expires_at,'infinity'::timestamptz)),
 'serverNow',clock_timestamp()
)
from public.deposit_promo_activations a
join public.deposit_promo_codes c on c.id=a.promo_id
where a.user_id=p_user_id
  and a.expires_at>now()
  and c.enabled
  and (c.expires_at is null or c.expires_at>now())
  and not exists(
    select 1 from public.deposit_promo_redemptions r
    where r.promo_id=a.promo_id and r.user_id=p_user_id
  )
  and (
    select count(*) from public.deposit_promo_redemptions r where r.promo_id=c.id
  )<c.max_users
order by a.activated_at desc
limit 1;
$fn$;
revoke all on function public.deposit_promo_current(bigint) from public, anon, authenticated;
grant execute on function public.deposit_promo_current(bigint) to service_role;