create or replace function public.deposit_promo_admin_list()
returns jsonb language sql stable set search_path='' as $fn$
select coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'code',p.code,'bonusPercent',p.bonus_percent,
  'maxUsers',p.max_users,'minCredit',p.min_credit,'enabled',p.enabled,
  'expiresAt',p.expires_at,'createdAt',p.created_at,
  'reserved',coalesce(t.reserved,0),'completed',coalesce(t.completed,0),
  'used',coalesce(t.reserved,0)+coalesce(t.completed,0)
) order by p.created_at desc), '[]'::jsonb)
from public.deposit_promo_codes p
left join lateral (
 select count(*) filter(where r.status='reserved') reserved,
 count(*) filter(where r.status='completed') completed
 from public.deposit_promo_redemptions r where r.promo_id=p.id
) t on true;
$fn$;
revoke all on function public.deposit_promo_admin_list() from public, anon, authenticated;
grant execute on function public.deposit_promo_admin_list() to service_role;