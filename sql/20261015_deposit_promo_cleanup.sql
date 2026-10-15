create or replace function public.deposit_promo_cleanup()
returns integer language sql volatile set search_path='' as $fn$
with stale as (
 delete from public.deposit_promo_redemptions r
 using public.deposit_transactions d
 where r.deposit_id=d.id and r.status='reserved'
   and d.status in ('pending','confirming')
   and d.expires_at is not null
   and d.expires_at < now() - interval '2 hours'
 returning r.id
)
select count(*)::integer from stale;
$fn$;
revoke all on function public.deposit_promo_cleanup() from public, anon, authenticated;
grant execute on function public.deposit_promo_cleanup() to service_role;