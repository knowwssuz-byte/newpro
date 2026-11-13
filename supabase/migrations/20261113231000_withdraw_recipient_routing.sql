-- NewPro withdrawal destinations: self or third-party Telegram usernames.
-- Preserve legacy requests; new requests require a destination.
alter table public.withdraw_requests
  add column if not exists recipient_mode text,
  add column if not exists recipient_username text,
  add column if not exists recipient_source text,
  add column if not exists requester_username text;

alter table public.withdraw_requests
  drop constraint if exists withdraw_recipient_mode_check;
alter table public.withdraw_requests
  add constraint withdraw_recipient_mode_check
  check (recipient_mode is null or recipient_mode in ('self','other'));

alter table public.withdraw_requests
  drop constraint if exists withdraw_recipient_username_check;
alter table public.withdraw_requests
  add constraint withdraw_recipient_username_check
  check (recipient_username is null or recipient_username ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$');

-- Log old rejected decisions when allowing a user to resubmit the SAME owned copy.
create table if not exists public.withdraw_request_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.withdraw_requests(id) on delete cascade,
  previous_status text not null,
  previous_note text,
  previous_recipient_mode text,
  previous_recipient_username text,
  previous_created_at timestamptz,
  reopened_at timestamptz not null default now()
);
create index if not exists withdraw_request_attempts_request_idx
  on public.withdraw_request_attempts(request_id, reopened_at desc);

-- A short-lived bot prompt allows a Telegram user with no profile username
-- to reply with a recipient @username and retrieve it in the Web App.
create table if not exists public.withdraw_username_prompts (
  user_id bigint primary key references public.users(id) on delete cascade,
  awaiting_reply boolean not null default true,
  reply_username text,
  requested_at timestamptz not null default now(),
  replied_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  constraint withdraw_prompt_username_check
    check (reply_username is null or reply_username ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$')
);

alter table public.withdraw_request_attempts enable row level security;
alter table public.withdraw_username_prompts enable row level security;
revoke all on public.withdraw_request_attempts from public, anon, authenticated;
revoke all on public.withdraw_username_prompts from public, anon, authenticated;
grant select, insert, update, delete on public.withdraw_request_attempts to service_role;
grant select, insert, update, delete on public.withdraw_username_prompts to service_role;

-- Old two-argument method cannot create a recipient-less NEW request.
-- The production API switches to the five-argument version.
create or replace function public.request_gift_withdrawal_atomic(p_user_id bigint, p_history_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'WITHDRAW_RECIPIENT_REQUIRED';
end;
$$;
revoke execute on function public.request_gift_withdrawal_atomic(bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.request_gift_withdrawal_atomic(bigint, uuid) to service_role;

create or replace function public.request_gift_withdrawal_atomic(
  p_user_id bigint,
  p_history_id uuid,
  p_recipient_mode text,
  p_requested_username text,
  p_verified_username text
)
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
  v_verified text;
  v_entered text;
  v_recipient text;
  v_source text;
begin
  if p_recipient_mode not in ('self','other') or p_recipient_mode is null
    then raise exception 'RECIPIENT_MODE_INVALID'; end if;
  v_verified := regexp_replace(btrim(coalesce(p_verified_username,'')), '^@', '');
  v_entered := regexp_replace(btrim(coalesce(p_requested_username,'')), '^@', '');
  if v_verified !~ '^[A-Za-z][A-Za-z0-9_]{4,31}$' then v_verified := ''; end if;

  if p_recipient_mode = 'self' and v_verified <> '' then
    v_recipient := v_verified;
    v_source := 'telegram';
  else
    if v_entered !~ '^[A-Za-z][A-Za-z0-9_]{4,31}$'
      then raise exception 'RECIPIENT_USERNAME_INVALID'; end if;
    v_recipient := v_entered;
    v_source := 'entered';
  end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if v_user.is_banned then raise exception 'USER_BANNED'; end if;

  select * into v_history from public.open_history
    where id = p_history_id and user_id = p_user_id for update;
  if not found then raise exception 'GIFT_NOT_FOUND'; end if;
  if v_history.sold_at is not null then raise exception 'ALREADY_SOLD'; end if;
  if v_history.upgraded_at is not null then raise exception 'ALREADY_UPGRADED'; end if;

  if exists (
    select 1 from public.color_arena_gift_stakes
      where history_id = p_history_id and status = 'locked'
  ) then raise exception 'GIFT_LOCKED_IN_GAME'; end if;

  select * into v_gift from public.gifts where id = v_history.gift_id;
  if not found then raise exception 'GIFT_NOT_FOUND'; end if;
  if lower(coalesce(v_gift.type, 'gift')) <> 'gift'
    then raise exception 'BALANCE_REWARD'; end if;

  select * into v_request from public.withdraw_requests
    where history_id = p_history_id for update;

  if found then
    if v_request.status <> 'rejected' then
      raise exception 'WITHDRAW_ALREADY_REQUESTED';
    end if;
    -- History remains immutable for audit even when user retries a rejected gift.
    insert into public.withdraw_request_attempts (
      request_id, previous_status, previous_note, previous_recipient_mode,
      previous_recipient_username, previous_created_at
    ) values (
      v_request.id, v_request.status, v_request.admin_note,
      v_request.recipient_mode, v_request.recipient_username, v_request.created_at
    );

    update public.withdraw_requests
      set status = 'pending', admin_note = null,
          recipient_mode = p_recipient_mode,
          recipient_username = v_recipient,
          recipient_source = v_source,
          requester_username = nullif(v_verified,''),
          created_at = now(), updated_at = now()
      where id = v_request.id
      returning * into v_request;
  else
    insert into public.withdraw_requests (
      user_id, gift_id, history_id, status,
      recipient_mode, recipient_username, recipient_source, requester_username
    ) values (
      p_user_id, v_gift.id, p_history_id, 'pending',
      p_recipient_mode, v_recipient, v_source, nullif(v_verified,'')
    ) returning * into v_request;
  end if;

  return to_jsonb(v_request);
end;
$$;
revoke execute on function public.request_gift_withdrawal_atomic(bigint,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.request_gift_withdrawal_atomic(bigint,uuid,text,text,text)
  to service_role;
