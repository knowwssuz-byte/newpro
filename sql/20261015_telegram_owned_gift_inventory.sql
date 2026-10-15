-- Each owned copy gets an inventory record; catalog presence is never stock.
create table if not exists public.telegram_owned_gift_inventory (
 owner_user_id bigint not null,
 ownership_key text not null,
 gift_type text not null check(gift_type in ('unique','regular')),
 telegram_gift_id text not null,
 title text not null,
 gift_slug text,
 star_count numeric not null default 0,
 transferable boolean not null default false,
 transfer_cost numeric not null default 0,
 refunded boolean not null default false,
 linked_library_id uuid references public.gift_library(id) on delete set null,
 seen_at timestamptz not null default now(),
 primary key(owner_user_id,ownership_key)
);
create index if not exists tg_owned_gift_library_idx on public.telegram_owned_gift_inventory(linked_library_id);
alter table public.telegram_owned_gift_inventory enable row level security;
revoke all on table public.telegram_owned_gift_inventory from public,anon,authenticated;
grant select,insert,update on table public.telegram_owned_gift_inventory to service_role;
create unique index if not exists gift_library_unique_slug_idx
  on public.gift_library(slug) where slug is not null;
-- Regular gifts already cached by Telegram. Keep original thumbnails and true catalog
-- price, but NEVER interpret a catalog entry as a transferable prize or live stock.
insert into public.gift_library
  (title,slug,image_url,image_type,animation_url,webp_url,png_url,
   price,buy_price,background_value,is_active,source_url)
select c.title,'regular-'||c.telegram_gift_id,
  c.image_url,case when c.image_url ~* '\\.(jpe?g)(\\?|$)' then 'jpg' else 'png' end,
  coalesce(c.animation_url,''),'','',
  greatest(0,coalesce(c.star_count,0)),greatest(0,coalesce(c.star_count,0)),
  'linear-gradient(135deg,#1b2954,#101229)',true,
  'telegram:catalog:'||c.telegram_gift_id
from public.telegram_gift_catalog c
where not exists(select 1 from public.gift_library g where g.slug='regular-'||c.telegram_gift_id);
