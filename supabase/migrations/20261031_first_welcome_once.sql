-- A real Telegram account sees the Welcome Tour only on its first bootstrap.
-- Users who existed before rollout have already had prior access to the app;
-- backfill them as seen so they never get the new-user introduction.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS first_welcome_shown_at timestamptz;

UPDATE public.users
SET first_welcome_shown_at = COALESCE(first_welcome_shown_at, created_at)
WHERE first_welcome_shown_at IS NULL;

COMMENT ON COLUMN public.users.first_welcome_shown_at IS
  'Claimed once by authenticated initial bootstrap; NULL means the welcome tour has never been displayed.';
