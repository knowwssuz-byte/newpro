-- Giveaway media snapshots and draft/featured workflow. No balance mutations.
begin;
alter table public.giveaway_prizes add column if not exists gift_animation_url text not null default '';
alter table public.giveaways add column if not exists feature_on_publish boolean not null default false;
update public.giveaway_prizes p set gift_animation_url=coalesce(l.animation_url,'')
from public.gift_library l where l.id=p.library_gift_id and p.gift_animation_url='';
update public.giveaways set feature_on_publish=true,is_featured=false where status='draft' and is_featured;
update public.giveaways set is_featured=false where status not in ('draft','live') and is_featured;
create index if not exists giveaway_entries_rank_idx on public.giveaway_entries(giveaway_id,weight desc,joined_at,user_id);

CREATE OR REPLACE FUNCTION public.newpro_giveaway_create(p_title text, p_description text, p_mode text, p_entry_price integer, p_ends_at timestamp with time zone, p_prize_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare gid uuid;
declare candidate uuid;
declare g public.gift_library%rowtype;
declare rank_no integer:=0;
begin
 if char_length(btrim(coalesce(p_title,''))) not between 4 and 90 then raise exception 'INVALID_TITLE';end if;
 if p_mode not in ('equal','weighted') then raise exception 'INVALID_MODE';end if;
 if p_entry_price is null or p_entry_price<0 or p_entry_price>10000 then raise exception 'INVALID_PRICE';end if;
 if p_mode='weighted' and p_entry_price<1 then raise exception 'WEIGHTED_REQUIRES_PRICE';end if;
 if p_ends_at is null or p_ends_at<=now()+interval '5 minutes'
    or p_ends_at>now()+interval '90 days' then raise exception 'INVALID_END_DATE';end if;
 if coalesce(array_length(p_prize_ids,1),0)<1 or array_length(p_prize_ids,1)>10 then
  raise exception 'INVALID_PRIZE_COUNT';end if;
 insert into public.giveaways(title,description,mode,entry_price,ends_at)
  values(btrim(p_title),left(coalesce(p_description,''),700),p_mode,p_entry_price,p_ends_at)
  returning id into gid;
 foreach candidate in array p_prize_ids loop
  select * into g from public.gift_library where id=candidate and is_active=true;
  if not found then raise exception 'GIFT_NOT_ACTIVE';end if;
  rank_no:=rank_no+1;
  insert into public.giveaway_prizes(giveaway_id,place,library_gift_id,gift_title,gift_image_url,gift_animation_url)
   values(gid,rank_no,g.id,g.title,coalesce(nullif(g.image_url,''),nullif(g.png_url,''),nullif(g.webp_url,''),''),coalesce(g.animation_url,''));
 end loop;
 return gid;
end;
$function$;

CREATE OR REPLACE FUNCTION public.newpro_giveaway_public_list(p_user_id bigint)
 RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER
 STABLE
 SET search_path TO ''
AS $function$
select coalesce(jsonb_agg(item order by item->>'createdAt' desc),'[]'::jsonb)
from (
 select jsonb_build_object(
   'id',g.id,'title',g.title,'description',g.description,'mode',g.mode,
   'price',g.entry_price,'status',g.status,'endsAt',g.ends_at,'createdAt',g.created_at,
   'isFeatured',g.is_featured,'startsAt',g.starts_at,'seedCommit',g.seed_commit,
   'seedReveal',case when g.status='completed' then g.seed_secret else null end,
   'participants',(select count(*) from public.giveaway_entries where giveaway_id=g.id),
   'totalWeight',(select coalesce(sum(weight),0) from public.giveaway_entries where giveaway_id=g.id),
   'myWeight',(select coalesce(weight,0) from public.giveaway_entries where giveaway_id=g.id and user_id=p_user_id),
   'myStars',(select coalesce(total_stars,0) from public.giveaway_entries where giveaway_id=g.id and user_id=p_user_id),
   'prizes',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'place',p.place,'title',p.gift_title,'imageUrl',p.gift_image_url,'animationUrl',p.gift_animation_url,
      'winner',case when g.status='completed' and p.winner_id is not null
        then coalesce(nullif(u.first_name,''),'Player') else null end,
      'myWin',p.winner_id=p_user_id,'deliveryStatus',case when g.status='completed' then p.delivery_status else null end
     ) order by p.place),'[]'::jsonb)
     from public.giveaway_prizes p left join public.users u on u.id=p.winner_id where p.giveaway_id=g.id)
 ) item
 from public.giveaways g
 where g.status in ('live','completed')
 order by g.is_featured desc,g.created_at desc limit 100
) q;
$function$;

CREATE OR REPLACE FUNCTION public.newpro_giveaway_admin_list()
 RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER
 STABLE
 SET search_path TO ''
AS $function$
select coalesce(jsonb_agg(data order by (data->>'created_at') desc),'[]'::jsonb) from (
 select jsonb_build_object(
  'id',g.id,'title',g.title,'description',g.description,'mode',g.mode,
  'entry_price',g.entry_price,'status',g.status,'starts_at',g.starts_at,'ends_at',g.ends_at,
  'isFeatured',g.is_featured,'featureOnPublish',g.feature_on_publish,'updated_at',g.updated_at,'created_at',g.created_at,'drawn_at',g.drawn_at,'seed_commit',g.seed_commit,
  'seed_secret',case when g.status='completed' then g.seed_secret else null end,
  'members',(select count(*) from public.giveaway_entries e where e.giveaway_id=g.id),
  'totalStars',(select coalesce(sum(e.total_stars),0) from public.giveaway_entries e where e.giveaway_id=g.id),
  'prizes',(select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'place',p.place,'giftTitle',p.gift_title,
    'libraryGiftId',p.library_gift_id,'giftAnimationUrl',p.gift_animation_url,'giftImageUrl',p.gift_image_url,'winnerId',p.winner_id,'winnerName',u.first_name,
    'winnerUsername',u.username,'deliveryStatus',p.delivery_status,
    'deliveryNote',p.delivery_note) order by p.place),'[]'::jsonb)
     from public.giveaway_prizes p left join public.users u on u.id=p.winner_id where p.giveaway_id=g.id)
 ) data
 from public.giveaways g order by g.created_at desc limit 100
) series;
$function$;

-- Draft intent does not displace the current live feature until publication.
create or replace function public.newpro_giveaway_set_featured(p_giveaway uuid,p_featured boolean default true)
returns uuid language plpgsql security invoker set search_path='' as $$
declare g public.giveaways%rowtype;
begin
 perform pg_catalog.pg_advisory_xact_lock(64202611);
 select * into g from public.giveaways where id=p_giveaway for update;
 if not found or g.status not in ('draft','live') or (g.status='live' and g.ends_at<=now()) then
  raise exception 'GIVEAWAY_NOT_FEATUREABLE';
 end if;
 if g.status='draft' then
  update public.giveaways set feature_on_publish=coalesce(p_featured,false),updated_at=now() where id=g.id;
 else
  if p_featured then
   update public.giveaways set is_featured=false,updated_at=now() where is_featured and id<>g.id;
  end if;
  update public.giveaways set is_featured=coalesce(p_featured,false),updated_at=now() where id=g.id;
 end if;
 return g.id;
end;
$$;

-- Publication and feature promotion share the same lock and transaction.
create or replace function public.newpro_giveaway_publish(p_giveaway uuid,p_expected_updated_at timestamptz)
returns uuid language plpgsql security invoker set search_path='' as $$
declare g public.giveaways%rowtype;
begin
 perform pg_catalog.pg_advisory_xact_lock(64202611);
 select * into g from public.giveaways where id=p_giveaway for update;
 if not found or g.status<>'draft' then raise exception 'NOT_DRAFT';end if;
 if p_expected_updated_at is null or g.updated_at<>p_expected_updated_at then raise exception 'DRAFT_CHANGED';end if;
 if g.ends_at<=now() then raise exception 'INVALID_END_DATE';end if;
 if not exists(select 1 from public.giveaway_prizes where giveaway_id=g.id) then raise exception 'INVALID_PRIZE_COUNT';end if;
 if g.feature_on_publish then
  update public.giveaways set is_featured=false,updated_at=now() where is_featured and id<>g.id;
 end if;
 update public.giveaways set status='live',starts_at=now(),is_featured=feature_on_publish,
  feature_on_publish=false,updated_at=now() where id=g.id;
 return g.id;
end;
$$;

create or replace function public.newpro_giveaway_update_draft(
 p_giveaway uuid,p_expected_updated_at timestamptz,p_title text,p_description text,
 p_mode text,p_entry_price integer,p_ends_at timestamptz,p_prize_ids uuid[]
) returns uuid language plpgsql security invoker set search_path='' as $$
declare current_g public.giveaways%rowtype;
declare gift public.gift_library%rowtype;
declare candidate uuid;
declare place_no integer:=0;
begin
 select * into current_g from public.giveaways where id=p_giveaway for update;
 if not found or current_g.status<>'draft' then raise exception 'NOT_DRAFT';end if;
 if p_expected_updated_at is null or current_g.updated_at<>p_expected_updated_at then raise exception 'DRAFT_CHANGED';end if;
 if char_length(btrim(coalesce(p_title,''))) not between 4 and 90 then raise exception 'INVALID_TITLE';end if;
 if p_mode is null or p_mode not in ('equal','weighted') then raise exception 'INVALID_MODE';end if;
 if p_entry_price is null or p_entry_price<0 or p_entry_price>10000 or (p_mode='weighted' and p_entry_price<1) then raise exception 'INVALID_PRICE';end if;
 if p_ends_at is null or p_ends_at<=now()+interval '5 minutes' or p_ends_at>now()+interval '90 days' then raise exception 'INVALID_END_DATE';end if;
 if coalesce(array_length(p_prize_ids,1),0) not between 1 and 10 then raise exception 'INVALID_PRIZE_COUNT';end if;
 update public.giveaways set title=btrim(p_title),description=left(coalesce(p_description,''),700),
  mode=p_mode,entry_price=p_entry_price,ends_at=p_ends_at,updated_at=now() where id=p_giveaway;
 delete from public.giveaway_prizes where giveaway_id=p_giveaway;
 foreach candidate in array p_prize_ids loop
  select * into gift from public.gift_library where id=candidate and is_active;
  if not found then raise exception 'GIFT_NOT_ACTIVE';end if;
  place_no:=place_no+1;
  insert into public.giveaway_prizes(giveaway_id,place,library_gift_id,gift_title,gift_image_url,gift_animation_url)
  values(p_giveaway,place_no,gift.id,gift.title,
   coalesce(nullif(gift.image_url,''),nullif(gift.png_url,''),nullif(gift.webp_url,''),''),coalesce(gift.animation_url,''));
 end loop;
 return p_giveaway;
end;
$$;

-- Pages are read from one statement snapshot. A monotonic membership/weight
-- revision prevents appending a page from a different ordering. Changed pages
-- restart at rank 1, explicitly; no duplicates or silently skipped participants.
create or replace function public.newpro_giveaway_leaderboard_v2(
 p_giveaway uuid,p_user bigint,p_limit integer default 30,p_offset integer default 0,p_revision text default null
) returns jsonb language sql stable security invoker set search_path='' as $$
with totals as (
 select count(*) as total,coalesce(sum(weight),0) as total_weight,
  count(*)::text||':'||coalesce(sum(weight),0)::text as revision
 from public.giveaway_entries where giveaway_id=p_giveaway
), paging as (
 select *,p_offset>0 and p_revision is distinct from revision as reset,
  case when p_offset>0 and p_revision=revision then greatest(p_offset,0) else 0 end as page_offset,
  least(greatest(coalesce(p_limit,30),1),50) as page_limit from totals
), ranked as (
 select e.*,row_number() over(order by weight desc,joined_at,user_id) as rank
 from public.giveaway_entries e where e.giveaway_id=p_giveaway
), page_rows as (
 select r.* from ranked r,paging p
 where r.rank>p.page_offset and r.rank<=p.page_offset+p.page_limit
), selected as (
 select * from page_rows union select * from ranked where user_id=p_user
), people as (
 select r.user_id,jsonb_build_object(
  'key',md5(p_giveaway::text||':'||r.user_id::text),'rank',r.rank,
  'name',coalesce(nullif(btrim(u.first_name),''),nullif(btrim(u.username),''),'Ishtirokchi'),
  'weight',r.weight,'stars',r.total_stars,'isMe',r.user_id=p_user,
  'chance',case when p.total_weight>0 then r.weight::numeric/p.total_weight*100 else 0 end
 ) as person from selected r left join public.users u on u.id=r.user_id cross join paging p
)
select jsonb_build_object('revision',p.revision,'reset',p.reset,'total',p.total,'totalWeight',p.total_weight,
 'rows',coalesce((select jsonb_agg(person order by (person->>'rank')::bigint)
  from people where user_id in(select user_id from page_rows)),'[]'::jsonb),
 'me',(select person from people where user_id=p_user),
 'nextOffset',case when p.page_offset+p.page_limit<p.total then p.page_offset+p.page_limit else null end)
from paging p where exists(select 1 from public.giveaways where id=p_giveaway and status in ('live','completed'));
$$;

revoke all on function public.newpro_giveaway_create(text,text,text,integer,timestamptz,uuid[]),
 public.newpro_giveaway_public_list(bigint),public.newpro_giveaway_admin_list(),
 public.newpro_giveaway_set_featured(uuid,boolean),public.newpro_giveaway_publish(uuid,timestamptz),
 public.newpro_giveaway_update_draft(uuid,timestamptz,text,text,text,integer,timestamptz,uuid[]),
 public.newpro_giveaway_leaderboard_v2(uuid,bigint,integer,integer,text) from public,anon,authenticated;
grant execute on function public.newpro_giveaway_create(text,text,text,integer,timestamptz,uuid[]),
 public.newpro_giveaway_public_list(bigint),public.newpro_giveaway_admin_list(),
 public.newpro_giveaway_set_featured(uuid,boolean),public.newpro_giveaway_publish(uuid,timestamptz),
 public.newpro_giveaway_update_draft(uuid,timestamptz,text,text,text,integer,timestamptz,uuid[]),
 public.newpro_giveaway_leaderboard_v2(uuid,bigint,integer,integer,text) to service_role;
commit;
