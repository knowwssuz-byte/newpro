-- NEW PRO: atomic inventory actions; never expose these RPCs to client roles.
alter table public.withdraw_requests
  add column if not exists history_id uuid references public.open_history(id);

create unique index if not exists withdraw_requests_history_unique
  on public.withdraw_requests (history_id)
  where history_id is not null;

create or replace function public.sell_gift_atomic(p_user_id bigint, p_history_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
  v_history public.open_history%rowtype;
  v_gift public.gifts%rowtype;
  v_price numeric;
begin
  select * into v_user from public.users where id = p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if v_user.is_banned then raise exception 'USER_BANNED'; end if;

  select * into v_history from public.open_history
    where id = p_history_id and user_id = p_user_id for update;
  if not found then raise exception 'GIFT_NOT_FOUND'; end if;
  if v_history.sold_at is not null then raise exception 'ALREADY_SOLD'; end if;
  if exists(select 1 from public.withdraw_requests where history_id = p_history_id)
    then raise exception 'WITHDRAW_ALREADY_REQUESTED'; end if;

  select * into v_gift from public.gifts where id = v_history.gift_id;
  if not found then raise exception 'GIFT_NOT_FOUND'; end if;
  if lower(coalesce(v_gift.type, 'gift')) = 'balance'
    then raise exception 'BALANCE_REWARD'; end if;

  v_price := greatest(0, coalesce(v_gift.sell_price, v_gift.buy_price, v_gift.floor_price, 0));
  if v_price <= 0 then raise exception 'PRICE_NOT_SET'; end if;

  update public.open_history set sold_at = now(), sale_price = v_price
    where id = v_history.id returning * into v_history;
  update public.users set balance = balance + v_price
    where id = v_user.id returning * into v_user;

  return jsonb_build_object('balance', v_user.balance, 'salePrice', v_price,
    'history', to_jsonb(v_history));
end;
$$;

create or replace function public.request_gift_withdrawal_atomic(p_user_id bigint, p_history_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
  v_history public.open_history%rowtype;
  v_gift public.gifts%rowtype;
  v_request public.withdraw_requests%rowtype;
begin
  select * into v_user from public.users where id = p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if v_user.is_banned then raise exception 'USER_BANNED'; end if;

  select * into v_history from public.open_history
    where id = p_history_id and user_id = p_user_id for update;
  if not found then raise exception 'GIFT_NOT_FOUND'; end if;
  if v_history.sold_at is not null then raise exception 'ALREADY_SOLD'; end if;

  select * into v_gift from public.gifts where id = v_history.gift_id;
  if not found then raise exception 'GIFT_NOT_FOUND'; end if;
  if lower(coalesce(v_gift.type, 'gift')) = 'balance'
    then raise exception 'BALANCE_REWARD'; end if;

  if exists(select 1 from public.withdraw_requests where history_id = p_history_id)
    then raise exception 'WITHDRAW_ALREADY_REQUESTED'; end if;

  insert into public.withdraw_requests (user_id, gift_id, history_id, status)
    values (p_user_id, v_gift.id, p_history_id, 'pending')
    returning * into v_request;

  return to_jsonb(v_request);
end;
$$;

revoke execute on function public.sell_gift_atomic(bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.sell_gift_atomic(bigint, uuid) to service_role;
revoke execute on function public.request_gift_withdrawal_atomic(bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.request_gift_withdrawal_atomic(bigint, uuid) to service_role;
