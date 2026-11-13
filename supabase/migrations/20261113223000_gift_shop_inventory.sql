-- Gift Shop is independent from case drops and Upgrade stock.
-- Run this migration before deploying the Gift Shop API.
create table if not exists public.gift_shop_items (
  id uuid primary key default gen_random_uuid(),
  library_gift_id uuid not null unique references public.gift_library(id) on delete restrict,
  price numeric(18, 2) not null check (price > 0 and price = trunc(price) and price <= 1000000000),
  stock integer not null default 0 check (stock >= 0 and stock <= 100000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gift_shop_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references public.users(id) on delete restrict,
  shop_item_id uuid not null references public.gift_shop_items(id) on delete restrict,
  request_id uuid not null,
  gift_id uuid not null references public.gifts(id) on delete restrict,
  history_id uuid not null unique references public.open_history(id) on delete restrict,
  price numeric(18, 2) not null check (price > 0),
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create index if not exists gift_shop_purchases_user_created_idx
  on public.gift_shop_purchases (user_id, created_at desc);

alter table public.gift_shop_items enable row level security;
alter table public.gift_shop_purchases enable row level security;
revoke all on public.gift_shop_items from public, anon, authenticated;
revoke all on public.gift_shop_purchases from public, anon, authenticated;
grant select, insert, update, delete on public.gift_shop_items to service_role;
grant select, insert, update, delete on public.gift_shop_purchases to service_role;

-- The player never supplies the amount or gift media as trusted data.
-- The lock on users serializes retry requests per player and prevents double charges.
-- Any exception rolls back stock, balance, gift, history, and receipt together.
create or replace function public.newpro_gift_shop_buy(
  p_user_id bigint,
  p_shop_item_id uuid,
  p_request_id uuid,
  p_expected_price numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
  v_shop public.gift_shop_items%rowtype;
  v_library public.gift_library%rowtype;
  v_existing public.gift_shop_purchases%rowtype;
  v_gift public.gifts%rowtype;
  v_history public.open_history%rowtype;
  v_resale_price numeric;
begin
  if p_user_id is null or p_shop_item_id is null or p_request_id is null
    or p_expected_price is null then raise exception 'INVALID_PURCHASE'; end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if v_user.is_banned then raise exception 'USER_BANNED'; end if;

  select * into v_existing from public.gift_shop_purchases
    where user_id = p_user_id and request_id = p_request_id;
  if found then
    if v_existing.shop_item_id <> p_shop_item_id
      then raise exception 'REQUEST_REUSED'; end if;
    return jsonb_build_object(
      'balance', v_user.balance, 'giftId', v_existing.gift_id,
      'historyId', v_existing.history_id, 'price', v_existing.price,
      'shopItemId', v_existing.shop_item_id, 'duplicate', true
    );
  end if;

  select * into v_shop from public.gift_shop_items
    where id = p_shop_item_id for update;
  if not found or not v_shop.is_active then raise exception 'SHOP_GIFT_UNAVAILABLE'; end if;
  if v_shop.stock <= 0 then raise exception 'SHOP_GIFT_SOLD_OUT'; end if;
  if v_shop.price <> p_expected_price then raise exception 'SHOP_PRICE_CHANGED'; end if;
  if v_user.balance < v_shop.price then raise exception 'INSUFFICIENT_BALANCE'; end if;

  select * into v_library from public.gift_library
    where id = v_shop.library_gift_id;
  if not found or not v_library.is_active then raise exception 'SHOP_GIFT_UNAVAILABLE'; end if;

  -- Bought gifts can later be sold back for 80% of their original purchase
  -- price, so changing a listing never inflates the value of an owned copy.
  v_resale_price := trunc(v_shop.price * 0.8);

  update public.users set balance = balance - v_shop.price
    where id = v_user.id returning * into v_user;

  update public.gift_shop_items set stock = stock - 1, updated_at = now()
    where id = v_shop.id returning * into v_shop;

  insert into public.gifts (
    case_id, title, type, value, chance, real_chance, stock,
    image_url, animation_url, background_value, is_active,
    rarity, source, library_gift_id, floor_price, sell_price, buy_price
  ) values (
    null, v_library.title, 'gift', null, 0, 0, 0,
    coalesce(nullif(v_library.image_url,''),nullif(v_library.png_url,''),nullif(v_library.webp_url,'')),
    nullif(v_library.animation_url,''),
    v_library.background_value, false,
    'rare', 'gift_shop_purchase', v_library.id,
    v_resale_price, v_resale_price, v_resale_price
  ) returning * into v_gift;

  insert into public.open_history (user_id, case_id, gift_id)
    values (v_user.id, null, v_gift.id) returning * into v_history;

  insert into public.gift_shop_purchases
    (user_id, shop_item_id, request_id, gift_id, history_id, price)
    values (v_user.id, v_shop.id, p_request_id, v_gift.id, v_history.id, v_shop.price);

  return jsonb_build_object(
    'balance', v_user.balance, 'giftId', v_gift.id,
    'historyId', v_history.id, 'price', v_shop.price,
    'shopItemId', v_shop.id, 'remainingStock', v_shop.stock,
    'duplicate', false
  );
end;
$$;

revoke execute on function public.newpro_gift_shop_buy(bigint, uuid, uuid, numeric)
  from public, anon, authenticated;
grant execute on function public.newpro_gift_shop_buy(bigint, uuid, uuid, numeric)
  to service_role;
