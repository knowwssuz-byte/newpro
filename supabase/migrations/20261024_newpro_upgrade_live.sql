-- NEWPRO: Transactional Upgrade, final quote-safe schema.
-- Source copies live in open_history; a round is resolved exactly once.
-- Deploy with service_role RPC only, after reviewing existing schema.
alter table public.open_history add column if not exists upgraded_at timestamptz;

create table if not exists public.upgrade_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references public.users(id),
  request_id uuid not null,
  source_history_id uuid not null references public.open_history(id),
  source_gift_id uuid not null references public.gifts(id),
  target_gift_id uuid not null references public.gifts(id),
  reward_history_id uuid references public.open_history(id),
  source_price numeric(18,2) not null check(source_price>0),
  target_price numeric(18,2) not null check(target_price>0),
  chance numeric(6,2) not null check(chance>0 and chance<=85),
  roll numeric(8,5) not null check(roll>=0 and roll<100),
  outcome text not null check(outcome in ('won','lost')),
  created_at timestamptz not null default now(),
  constraint upgrade_request_once unique(user_id,request_id),
  constraint upgrade_source_once unique(source_history_id)
);
create index if not exists upgrade_rounds_user_recent on public.upgrade_rounds(user_id,created_at desc);
alter table public.upgrade_rounds enable row level security;
revoke all on table public.upgrade_rounds from public,anon,authenticated;
grant select,insert,update on table public.upgrade_rounds to service_role;
drop function if exists public.upgrade_gift_atomic(bigint,uuid,uuid,uuid);

CREATE OR REPLACE FUNCTION public.upgrade_gift_atomic(p_user_id bigint, p_source_history_id uuid, p_target_gift_id uuid, p_request_id uuid, p_quote jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user public.users%rowtype;
  v_source public.open_history%rowtype;
  v_source_gift public.gifts%rowtype;
  v_target public.gifts%rowtype;
  v_reward public.open_history%rowtype;
  v_existing public.upgrade_rounds%rowtype;
  v_round public.upgrade_rounds%rowtype;
  v_source_price numeric;
  v_target_price numeric;
  v_chance numeric;
  v_roll numeric;
  v_won boolean;
  v_enabled boolean;
begin
  -- Single user's actions are serialized with case opening, selling and withdrawal.
  select * into v_user from public.users where id=p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if coalesce(v_user.is_banned,false) then raise exception 'USER_BANNED'; end if;

  select * into v_existing from public.upgrade_rounds
  where user_id=p_user_id and request_id=p_request_id;
  if found then
    if v_existing.source_history_id<>p_source_history_id or v_existing.target_gift_id<>p_target_gift_id
      then raise exception 'REQUEST_ID_REUSED'; end if;
    return jsonb_build_object('ok',true,'replayed',true,'won',v_existing.outcome='won',
      'chance',v_existing.chance,'round',to_jsonb(v_existing),'rewardHistoryId',v_existing.reward_history_id);
  end if;

  select coalesce((value->>'enabled')='true',false) into v_enabled
  from public.app_settings where key='feature_upgrade';
  if not coalesce(v_enabled,false) then raise exception 'UPGRADE_DISABLED'; end if;

  select * into v_source from public.open_history
  where id=p_source_history_id and user_id=p_user_id for update;
  if not found then raise exception 'SOURCE_NOT_FOUND'; end if;
  if v_source.sold_at is not null or v_source.upgraded_at is not null
    then raise exception 'SOURCE_ALREADY_USED'; end if;
  if exists(select 1 from public.withdraw_requests
    where history_id=v_source.id and status in ('pending','approved'))
    then raise exception 'SOURCE_RESERVED'; end if;

  select * into v_source_gift from public.gifts where id=v_source.gift_id;
  if not found or lower(coalesce(v_source_gift.type,'gift')) <> 'gift'
    then raise exception 'SOURCE_NOT_GIFT'; end if;
  v_source_price:=coalesce(nullif(v_source_gift.sell_price,0),
      nullif(v_source_gift.buy_price,0),nullif(v_source_gift.floor_price,0),0);
  if v_source_price<=0 then raise exception 'SOURCE_PRICE_MISSING'; end if;

  select * into v_target from public.gifts where id=p_target_gift_id for update;
  if not found or not v_target.is_active or v_target.stock<=0
     or lower(coalesce(v_target.type,'gift'))<>'gift'
    then raise exception 'TARGET_UNAVAILABLE'; end if;
  v_target_price:=coalesce(nullif(v_target.sell_price,0),
      nullif(v_target.buy_price,0),nullif(v_target.floor_price,0),0);
  if v_target_price<=v_source_price then raise exception 'TARGET_NOT_HIGHER'; end if;
  -- Exact quoted percentage. House factor 0.82; no artificial lower bound.
  v_chance:=round(least(85::numeric,(v_source_price/v_target_price)*82),2);
  if v_chance<=0 then raise exception 'CHANCE_TOO_LOW'; end if;
  if p_quote is null or not (p_quote ? 'sourcePrice' and p_quote ? 'targetPrice' and p_quote ? 'chance')
    then raise exception 'QUOTE_MISSING'; end if;
  if (p_quote->>'sourcePrice')::numeric<>v_source_price
     or (p_quote->>'targetPrice')::numeric<>v_target_price
     or (p_quote->>'chance')::numeric<>v_chance
    then raise exception 'QUOTE_CHANGED'; end if;
  -- First 48 random UUID bits are uniform; independent of browser/client values.
  v_roll:=(('x'||substring(replace(gen_random_uuid()::text,'-',''),1,12))::bit(48)::bigint)::numeric
       /281474976710656::numeric*100;
  v_won:=v_roll<v_chance;

  if v_won then
    update public.gifts set stock=stock-1, updated_at=now()
    where id=v_target.id and stock>0 and is_active=true
    returning * into v_target;
    if not found then raise exception 'TARGET_UNAVAILABLE'; end if;
  end if;

  -- Keep sold_at as a legacy consumption guard for old selling/withdraw RPCs.
  update public.open_history
  set sold_at=now(), upgraded_at=now(), sale_price=0
  where id=v_source.id and sold_at is null and upgraded_at is null;
  if not found then raise exception 'SOURCE_ALREADY_USED'; end if;

  if v_won then
    insert into public.open_history(user_id,case_id,gift_id)
      values(p_user_id,v_target.case_id,v_target.id) returning * into v_reward;
  end if;

  insert into public.upgrade_rounds(user_id,request_id,source_history_id,source_gift_id,
    target_gift_id,reward_history_id,source_price,target_price,chance,roll,outcome)
  values(p_user_id,p_request_id,v_source.id,v_source_gift.id,v_target.id,
    v_reward.id,v_source_price,v_target_price,v_chance,v_roll,
    case when v_won then 'won' else 'lost' end)
  returning * into v_round;

  return jsonb_build_object('ok',true,'replayed',false,'won',v_won,
    'chance',v_chance,'round',to_jsonb(v_round),'rewardHistoryId',v_reward.id);
end;
$function$;

revoke all on function public.upgrade_gift_atomic(bigint,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.upgrade_gift_atomic(bigint,uuid,uuid,uuid,jsonb) to service_role;

insert into public.app_settings(key,value)
values('feature_upgrade','{"enabled":false}'::jsonb)
on conflict(key) do nothing;
