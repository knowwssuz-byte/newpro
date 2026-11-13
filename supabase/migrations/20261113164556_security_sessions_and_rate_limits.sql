-- Backend-only application. Public clients only subscribe to sanitized Arena
-- events; all user data and balance operations pass through the Telegram API.
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant select on public.color_arena_events to anon, authenticated;
-- Preserve the existing service role paths and future migration access.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
-- PUBLIC's function execute default is global, so a schema-only revoke is
-- insufficient. All privileged functions must opt into their callers.
alter default privileges for role postgres revoke execute on functions from public;

create table public.admin_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index admin_sessions_expiry_idx on public.admin_sessions(expires_at);
alter table public.admin_sessions enable row level security;
revoke all on public.admin_sessions from public, anon, authenticated;
grant select, insert, delete on public.admin_sessions to service_role;

create table public.security_rate_limits (
  key text primary key check (key ~ '^[a-f0-9]{64}$'),
  hits integer not null check (hits > 0),
  expires_at timestamptz not null
);
create index security_rate_limits_expiry_idx on public.security_rate_limits(expires_at);
alter table public.security_rate_limits enable row level security;
revoke all on public.security_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.security_rate_limits to service_role;

create function public.newpro_consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_hits integer; v_expiry timestamptz; v_now timestamptz := clock_timestamp();
begin
  if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_limit is null or p_limit not between 1 and 10000
     or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'INVALID_RATE_LIMIT';
  end if;
  insert into public.security_rate_limits as r(key,hits,expires_at)
  values(p_key,1,v_now + make_interval(secs => p_window_seconds))
  on conflict(key) do update set
    hits = case when r.expires_at <= v_now then 1 else least(r.hits + 1, p_limit + 1) end,
    expires_at = case when r.expires_at <= v_now then v_now + make_interval(secs => p_window_seconds) else r.expires_at end
  returning hits,expires_at into v_hits,v_expiry;
  return jsonb_build_object('allowed', v_hits <= p_limit,
    'retry_after', greatest(1,ceil(extract(epoch from v_expiry-v_now))::integer));
end;
$$;
revoke all on function public.newpro_consume_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.newpro_consume_rate_limit(text,integer,integer) to service_role;

-- Retain no expired rate-limit or session identifiers beyond one day.
-- pg_cron is present in production; isolated test databases can omit it.
do $cleanup$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('newpro_security_cleanup', '*/15 * * * *',
      'delete from public.security_rate_limits where expires_at < now() - interval ''1 day''; delete from public.admin_sessions where expires_at < now();');
  end if;
end;
$cleanup$;
