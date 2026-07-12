alter table public.withdraw_requests
  add column if not exists history_id bigint references public.open_history(id) on delete restrict;

create unique index if not exists withdraw_requests_history_id_unique
  on public.withdraw_requests(history_id)
  where history_id is not null;

create index if not exists withdraw_requests_user_id_idx
  on public.withdraw_requests(user_id);
