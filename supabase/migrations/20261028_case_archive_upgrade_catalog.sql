alter table public.cases add column if not exists archived_at timestamptz;
alter table public.gifts alter column case_id drop not null;
create unique index if not exists newpro_upgrade_catalog_library_unique on public.gifts(library_gift_id) where source='upgrade_catalog' and library_gift_id is not null;
