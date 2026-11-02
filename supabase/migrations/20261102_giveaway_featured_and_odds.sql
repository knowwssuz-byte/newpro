-- 2026-11-02 · NewPro Giveaway primary card and public odds pages.
-- Applied to the NewPro Supabase project; kept here for reproducible environments.
alter table public.giveaways
  add column if not exists is_featured boolean not null default false;
create unique index if not exists giveaways_one_featured_idx
  on public.giveaways(is_featured) where is_featured=true;

create or replace function public.newpro_giveaway_set_featured(
 p_giveaway uuid,p_featured boolean default true
) returns uuid language plpgsql security invoker
set search_path=''
as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(64202611);
 if p_featured then
   if not exists (select 1 from public.giveaways where id=p_giveaway and status in ('draft','live')) then
     raise exception 'GIVEAWAY_NOT_FEATUREABLE';
   end if;
   update public.giveaways set is_featured=false,updated_at=now() where is_featured and id<>p_giveaway;
   update public.giveaways set is_featured=true,updated_at=now() where id=p_giveaway and status in ('draft','live');
 else
   update public.giveaways set is_featured=false,updated_at=now() where id=p_giveaway and is_featured;
 end if;
 return p_giveaway;
end;
$$;
revoke all on function public.newpro_giveaway_set_featured(uuid,boolean) from public,anon,authenticated;
grant execute on function public.newpro_giveaway_set_featured(uuid,boolean) to service_role;

create or replace function public.newpro_giveaway_leaderboard(
 p_giveaway uuid,p_limit integer default 30,p_offset integer default 0
) returns jsonb language sql stable security invoker set search_path=''
as $$
select pg_catalog.jsonb_build_object(
 'total',(select count(*) from public.giveaway_entries e where e.giveaway_id=g.id),
 'totalWeight',(select coalesce(sum(e.weight),0) from public.giveaway_entries e where e.giveaway_id=g.id),
 'rows',coalesce((
  select jsonb_agg(pg_catalog.jsonb_build_object(
   'userId',ranked.user_id,
   'name',coalesce(nullif(pg_catalog.btrim(u.first_name),''),nullif(pg_catalog.btrim(u.username),''),'Ishtirokchi'),
   'username',coalesce(u.username,''),
   'weight',ranked.weight,'stars',ranked.total_stars
  ) order by ranked.weight desc,ranked.joined_at asc,ranked.user_id asc)
  from (
   select e.user_id,e.weight,e.total_stars,e.joined_at
   from public.giveaway_entries e where e.giveaway_id=g.id
   order by e.weight desc,e.joined_at asc,e.user_id asc
   limit least(greatest(coalesce(p_limit,30),1),50)
   offset greatest(coalesce(p_offset,0),0)
  ) ranked
  left join public.users u on u.id=ranked.user_id
 ),'[]'::jsonb)
)
from public.giveaways g where g.id=p_giveaway and g.status in ('live','completed');
$$;
revoke all on function public.newpro_giveaway_leaderboard(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.newpro_giveaway_leaderboard(uuid,integer,integer) to service_role;
