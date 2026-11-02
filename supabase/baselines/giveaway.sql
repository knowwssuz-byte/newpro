-- Recovered read-only from NewPro on 2026-11-02. No user rows or secrets.
-- Run ONLY when bootstrapping the missing giveaway subsystem, after users/gift_library.
-- Existing deployments already have this schema. See docs/giveaway-upgrade.md.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.giveaways (
  id uuid default gen_random_uuid() not null,
  title text not null,
  description text default ''::text not null,
  mode text not null,
  entry_price integer default 0 not null,
  status text default 'draft'::text not null,
  starts_at timestamp with time zone default now() not null,
  ends_at timestamp with time zone not null,
  seed_secret text default encode(extensions.gen_random_bytes(32), 'hex'::text) not null,
  seed_commit text generated always as (encode(extensions.digest(seed_secret, 'sha256'::text), 'hex'::text)) stored,
  drawn_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  is_featured boolean default false not null,
  constraint giveaways_entry_price_check CHECK (((entry_price >= 0) AND (entry_price <= 10000))),
  constraint giveaways_mode_check CHECK ((mode = ANY (ARRAY['equal'::text, 'weighted'::text]))),
  constraint giveaways_pkey PRIMARY KEY (id),
  constraint giveaways_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'live'::text, 'completed'::text, 'cancelled'::text]))),
  constraint giveaways_title_check CHECK (((char_length(title) >= 4) AND (char_length(title) <= 90))),
  constraint valid_giveaway_period CHECK ((ends_at > starts_at)),
  constraint weighted_has_price CHECK (((mode <> 'weighted'::text) OR (entry_price >= 1)))
);
alter table public.giveaways enable row level security;
revoke all on public.giveaways from public, anon, authenticated;
grant select, insert, update, delete on public.giveaways to service_role;

create table if not exists public.giveaway_prizes (
  id uuid default gen_random_uuid() not null,
  giveaway_id uuid not null,
  place integer not null,
  library_gift_id uuid not null,
  gift_title text not null,
  gift_image_url text default ''::text not null,
  winner_id bigint,
  delivery_status text default 'unassigned'::text not null,
  delivery_note text,
  delivered_at timestamp with time zone,
  constraint giveaway_prizes_delivery_status_check CHECK ((delivery_status = ANY (ARRAY['unassigned'::text, 'pending'::text, 'delivered'::text]))),
  constraint giveaway_prizes_giveaway_id_fkey FOREIGN KEY (giveaway_id) REFERENCES public.giveaways(id) ON DELETE CASCADE,
  constraint giveaway_prizes_giveaway_id_place_key UNIQUE (giveaway_id, place),
  constraint giveaway_prizes_library_gift_id_fkey FOREIGN KEY (library_gift_id) REFERENCES public.gift_library(id) ON DELETE RESTRICT,
  constraint giveaway_prizes_pkey PRIMARY KEY (id),
  constraint giveaway_prizes_place_check CHECK (((place >= 1) AND (place <= 50))),
  constraint giveaway_prizes_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.users(id) ON DELETE RESTRICT
);
alter table public.giveaway_prizes enable row level security;
revoke all on public.giveaway_prizes from public, anon, authenticated;
grant select, insert, update, delete on public.giveaway_prizes to service_role;

create table if not exists public.giveaway_entries (
  giveaway_id uuid not null,
  user_id bigint not null,
  total_stars bigint default 0 not null,
  weight bigint default 1 not null,
  joined_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint giveaway_entries_giveaway_id_fkey FOREIGN KEY (giveaway_id) REFERENCES public.giveaways(id) ON DELETE RESTRICT,
  constraint giveaway_entries_pkey PRIMARY KEY (giveaway_id, user_id),
  constraint giveaway_entries_total_stars_check CHECK (((total_stars >= 0) AND (total_stars <= 100000000))),
  constraint giveaway_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
  constraint giveaway_entries_weight_check CHECK (((weight >= 1) AND (weight <= 100000000)))
);
alter table public.giveaway_entries enable row level security;
revoke all on public.giveaway_entries from public, anon, authenticated;
grant select, insert, update, delete on public.giveaway_entries to service_role;

create table if not exists public.giveaway_contributions (
  giveaway_id uuid not null,
  request_id uuid not null,
  user_id bigint not null,
  stars integer not null,
  created_at timestamp with time zone default now() not null,
  constraint giveaway_contributions_giveaway_id_fkey FOREIGN KEY (giveaway_id) REFERENCES public.giveaways(id) ON DELETE RESTRICT,
  constraint giveaway_contributions_pkey PRIMARY KEY (giveaway_id, request_id),
  constraint giveaway_contributions_stars_check CHECK (((stars >= 0) AND (stars <= 10000))),
  constraint giveaway_contributions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);
alter table public.giveaway_contributions enable row level security;
revoke all on public.giveaway_contributions from public, anon, authenticated;
grant select, insert, update, delete on public.giveaway_contributions to service_role;

CREATE INDEX IF NOT EXISTS idx_giveaway_contrib_user ON public.giveaway_contributions USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_giveaway_entries_user ON public.giveaway_entries USING btree (user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_giveaway_prizes_gift ON public.giveaway_prizes USING btree (library_gift_id);
CREATE INDEX IF NOT EXISTS idx_giveaways_live ON public.giveaways USING btree (status, ends_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS giveaways_one_featured_idx ON public.giveaways USING btree (is_featured) WHERE (is_featured = true);

CREATE OR REPLACE FUNCTION public.newpro_giveaway_draw(p_giveaway uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare g public.giveaways%rowtype;
declare p public.giveaway_prizes%rowtype;
declare chosen bigint;
declare winners integer:=0;
begin
 select * into g from public.giveaways where id=p_giveaway for update;
 if not found then raise exception 'GIVEAWAY_NOT_FOUND';end if;
 if g.status='completed' then return jsonb_build_object('alreadyDrawn',true,'winners',
  (select count(*) from public.giveaway_prizes where giveaway_id=p_giveaway and winner_id is not null));end if;
 if g.status<>'live' or now()<g.ends_at then raise exception 'DRAW_NOT_ALLOWED';end if;
 for p in select * from public.giveaway_prizes where giveaway_id=p_giveaway order by place asc loop
   chosen:=null;
   select en.user_id into chosen from public.giveaway_entries en
   where en.giveaway_id=p_giveaway and not exists(
     select 1 from public.giveaway_prizes used
     where used.giveaway_id=p_giveaway and used.winner_id=en.user_id
   )
   order by (
     -ln(greatest(1::numeric, (
       get_byte(extensions.digest(g.seed_secret||':'||p.place||':'||en.user_id,'sha256'),0)::bigint*1099511627776+
       get_byte(extensions.digest(g.seed_secret||':'||p.place||':'||en.user_id,'sha256'),1)::bigint*4294967296+
       get_byte(extensions.digest(g.seed_secret||':'||p.place||':'||en.user_id,'sha256'),2)::bigint*16777216+
       get_byte(extensions.digest(g.seed_secret||':'||p.place||':'||en.user_id,'sha256'),3)::bigint*65536+
       get_byte(extensions.digest(g.seed_secret||':'||p.place||':'||en.user_id,'sha256'),4)::bigint*256+
       get_byte(extensions.digest(g.seed_secret||':'||p.place||':'||en.user_id,'sha256'),5)::bigint
     ))/281474976710657::numeric)/greatest(en.weight,1)
   ) asc, en.user_id asc
   limit 1;
   if chosen is not null then
     update public.giveaway_prizes set winner_id=chosen,delivery_status='pending'
      where id=p.id;
     winners:=winners+1;
   end if;
 end loop;
 update public.giveaways set status='completed',drawn_at=now(),updated_at=now()
 where id=p_giveaway;
 return jsonb_build_object('alreadyDrawn',false,'winners',winners,'seed',g.seed_secret,'commit',g.seed_commit);
end;
$function$;
revoke all on function public.newpro_giveaway_draw(uuid) from public, anon, authenticated;
grant execute on function public.newpro_giveaway_draw(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.newpro_giveaway_join(p_giveaway uuid, p_user bigint, p_amount integer, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare g public.giveaways%rowtype;
declare u public.users%rowtype;
declare e public.giveaway_entries%rowtype;
declare old public.giveaway_contributions%rowtype;
begin
 if p_giveaway is null or p_user is null or p_request is null or p_amount is null
    or p_amount<0 or p_amount>10000 then raise exception 'INVALID_REQUEST';end if;
 select * into g from public.giveaways where id=p_giveaway for update;
 if not found then raise exception 'GIVEAWAY_NOT_FOUND';end if;
 if g.status='cancelled' then raise exception 'GIVEAWAY_CANCELLED';end if;
 -- Check retry idempotency BEFORE the deadline: a lost network reply must not
 -- turn a successful payment into an apparent failure once the contest closes.
 select * into old from public.giveaway_contributions where giveaway_id=p_giveaway and request_id=p_request;
 if found then
  if old.user_id<>p_user or old.stars<>p_amount then raise exception 'REQUEST_CONFLICT';end if;
  select * into e from public.giveaway_entries where giveaway_id=p_giveaway and user_id=p_user;
  return jsonb_build_object('replayed',true,'weight',e.weight,'totalStars',e.total_stars);
 end if;
 if g.status<>'live' or now()<g.starts_at or now()>=g.ends_at then raise exception 'GIVEAWAY_NOT_OPEN';end if;
 select * into u from public.users where id=p_user for update;
 if not found or u.is_banned then raise exception 'USER_NOT_ALLOWED';end if;
 select * into e from public.giveaway_entries where giveaway_id=p_giveaway and user_id=p_user;
 if g.mode='equal' then
  if found then raise exception 'ALREADY_JOINED';end if;
  if p_amount<>g.entry_price then raise exception 'INVALID_PRICE';end if;
 elsif g.mode='weighted' then
  if p_amount<g.entry_price or p_amount>10000 then raise exception 'INVALID_STAKE';end if;
  if found and e.total_stars+p_amount>100000000 then raise exception 'MAX_STAKE_REACHED';end if;
 else raise exception 'INVALID_MODE';end if;
 if p_amount>0 then
  update public.users set balance=balance-p_amount where id=p_user and balance>=p_amount;
  if not found then raise exception 'INSUFFICIENT_BALANCE';end if;
 end if;
 insert into public.giveaway_contributions(giveaway_id,request_id,user_id,stars)
 values(p_giveaway,p_request,p_user,p_amount);
 insert into public.giveaway_entries(giveaway_id,user_id,total_stars,weight)
 values(p_giveaway,p_user,p_amount,case when g.mode='weighted' then p_amount else 1 end)
 on conflict(giveaway_id,user_id) do update set
 total_stars=public.giveaway_entries.total_stars+excluded.total_stars,
 weight=public.giveaway_entries.weight+(case when g.mode='weighted' then p_amount else 0 end),
 updated_at=now()
 returning * into e;
 return jsonb_build_object('replayed',false,'weight',e.weight,'totalStars',e.total_stars);
end;
$function$;
revoke all on function public.newpro_giveaway_join(uuid, bigint, integer, uuid) from public, anon, authenticated;
grant execute on function public.newpro_giveaway_join(uuid, bigint, integer, uuid) to service_role;

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
  insert into public.giveaway_prizes(giveaway_id,place,library_gift_id,gift_title,gift_image_url)
   values(gid,rank_no,g.id,g.title,coalesce(nullif(g.image_url,''),nullif(g.png_url,''),nullif(g.webp_url,''),''));
 end loop;
 return gid;
end;
$function$;
revoke all on function public.newpro_giveaway_create(text, text, text, integer, timestamp with time zone, uuid[]) from public, anon, authenticated;
grant execute on function public.newpro_giveaway_create(text, text, text, integer, timestamp with time zone, uuid[]) to service_role;

CREATE OR REPLACE FUNCTION public.newpro_giveaway_cancel(p_giveaway uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare g public.giveaways%rowtype;
declare total numeric:=0;
declare people integer:=0;
begin
 select * into g from public.giveaways where id=p_giveaway for update;
 if not found then raise exception 'GIVEAWAY_NOT_FOUND';end if;
 if g.status='cancelled' then return jsonb_build_object('alreadyCancelled',true);end if;
 if g.status not in ('draft','live') then raise exception 'CANCEL_NOT_ALLOWED';end if;
 select coalesce(sum(total_stars),0),count(*)
 into total,people from public.giveaway_entries where giveaway_id=p_giveaway;
 update public.users u set balance=u.balance+e.total_stars
 from public.giveaway_entries e
 where e.giveaway_id=p_giveaway and e.user_id=u.id and e.total_stars>0;
 update public.giveaways set status='cancelled',updated_at=now() where id=p_giveaway;
 return jsonb_build_object('refundedStars',total,'members',people);
end;
$function$;
revoke all on function public.newpro_giveaway_cancel(uuid) from public, anon, authenticated;
grant execute on function public.newpro_giveaway_cancel(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.newpro_giveaway_delivery(p_prize uuid, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare p public.giveaway_prizes%rowtype;
begin
 if char_length(btrim(coalesce(p_note,'')))<8 then raise exception 'PROOF_REQUIRED';end if;
 select * into p from public.giveaway_prizes where id=p_prize for update;
 if not found or p.winner_id is null then raise exception 'WINNER_REQUIRED';end if;
 if p.delivery_status='delivered' then return jsonb_build_object('alreadyDelivered',true);end if;
 if p.delivery_status<>'pending' then raise exception 'NOT_PENDING';end if;
 update public.giveaway_prizes set delivery_status='delivered',
  delivery_note=left(btrim(p_note),500),delivered_at=now()
 where id=p_prize;
 return jsonb_build_object('delivered',true,'winnerId',p.winner_id,'giftTitle',p.gift_title);
end;
$function$;
revoke all on function public.newpro_giveaway_delivery(uuid, text) from public, anon, authenticated;
grant execute on function public.newpro_giveaway_delivery(uuid, text) to service_role;

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
  'created_at',g.created_at,'drawn_at',g.drawn_at,'seed_commit',g.seed_commit,
  'seed_secret',case when g.status='completed' then g.seed_secret else null end,
  'members',(select count(*) from public.giveaway_entries e where e.giveaway_id=g.id),
  'totalStars',(select coalesce(sum(e.total_stars),0) from public.giveaway_entries e where e.giveaway_id=g.id),
  'prizes',(select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'place',p.place,'giftTitle',p.gift_title,
    'giftImageUrl',p.gift_image_url,'winnerId',p.winner_id,'winnerName',u.first_name,
    'winnerUsername',u.username,'deliveryStatus',p.delivery_status,
    'deliveryNote',p.delivery_note) order by p.place),'[]'::jsonb)
     from public.giveaway_prizes p left join public.users u on u.id=p.winner_id where p.giveaway_id=g.id)
 ) data
 from public.giveaways g order by g.created_at desc limit 100
) series;
$function$;
revoke all on function public.newpro_giveaway_admin_list() from public, anon, authenticated;
grant execute on function public.newpro_giveaway_admin_list() to service_role;

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
   'seedCommit',g.seed_commit,
   'seedReveal',case when g.status='completed' then g.seed_secret else null end,
   'participants',(select count(*) from public.giveaway_entries where giveaway_id=g.id),
   'totalWeight',(select coalesce(sum(weight),0) from public.giveaway_entries where giveaway_id=g.id),
   'myWeight',(select coalesce(weight,0) from public.giveaway_entries where giveaway_id=g.id and user_id=p_user_id),
   'myStars',(select coalesce(total_stars,0) from public.giveaway_entries where giveaway_id=g.id and user_id=p_user_id),
   'prizes',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'place',p.place,'title',p.gift_title,'imageUrl',p.gift_image_url,
      'winner',case when g.status='completed' and p.winner_id is not null
        then coalesce(nullif(u.first_name,''),'Player') else null end,
      'myWin',p.winner_id=p_user_id,'deliveryStatus',case
        when p.winner_id=p_user_id then p.delivery_status else null end
     ) order by p.place),'[]'::jsonb)
     from public.giveaway_prizes p left join public.users u on u.id=p.winner_id where p.giveaway_id=g.id)
 ) item
 from public.giveaways g
 where g.status in ('live','completed')
 order by g.created_at desc limit 25
) q;
$function$;
revoke all on function public.newpro_giveaway_public_list(bigint) from public, anon, authenticated;
grant execute on function public.newpro_giveaway_public_list(bigint) to service_role;

CREATE OR REPLACE FUNCTION public.newpro_giveaway_set_featured(p_giveaway uuid, p_featured boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY INVOKER
 SET search_path TO ''
AS $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(64202611);
  if p_featured then
    if not exists (
      select 1 from public.giveaways where id = p_giveaway
        and status in ('draft','live')
    ) then
      raise exception 'GIVEAWAY_NOT_FEATUREABLE';
    end if;
    update public.giveaways set is_featured=false,updated_at=now()
      where is_featured=true and id<>p_giveaway;
    update public.giveaways set is_featured=true,updated_at=now()
      where id=p_giveaway and status in ('draft','live');
  else
    update public.giveaways set is_featured=false,updated_at=now()
      where id=p_giveaway and is_featured=true;
  end if;
  return p_giveaway;
end;
$function$;
revoke all on function public.newpro_giveaway_set_featured(uuid, boolean) from public, anon, authenticated;
grant execute on function public.newpro_giveaway_set_featured(uuid, boolean) to service_role;

CREATE OR REPLACE FUNCTION public.newpro_giveaway_leaderboard(p_giveaway uuid, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER
 STABLE
 SET search_path TO ''
AS $function$
select pg_catalog.jsonb_build_object(
 'total',(select count(*) from public.giveaway_entries e where e.giveaway_id=g.id),
 'totalWeight',(select coalesce(sum(e.weight),0) from public.giveaway_entries e where e.giveaway_id=g.id),
 'rows',coalesce((
   select jsonb_agg(pg_catalog.jsonb_build_object(
     'userId',ranked.user_id,
     'name',coalesce(nullif(pg_catalog.btrim(u.first_name),''),nullif(pg_catalog.btrim(u.username),''),'Ishtirokchi'),
     'username',coalesce(u.username,''),
     'weight',ranked.weight,
     'stars',ranked.total_stars
   ) order by ranked.weight desc, ranked.joined_at asc, ranked.user_id asc)
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
from public.giveaways g
where g.id=p_giveaway and g.status in ('live','completed');
$function$;
revoke all on function public.newpro_giveaway_leaderboard(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.newpro_giveaway_leaderboard(uuid, integer, integer) to service_role;
