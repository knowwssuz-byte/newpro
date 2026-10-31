-- Private test-payment archive constraints and legacy duplicate index cleanup.
ALTER TABLE launch_archive.deposit_transactions_snapshot_20261031
  ADD CONSTRAINT deposit_transactions_snapshot_20261031_pkey PRIMARY KEY(id);
ALTER TABLE launch_archive.withdraw_requests_snapshot_20261031
  ADD CONSTRAINT withdraw_requests_snapshot_20261031_pkey PRIMARY KEY(id);
-- The primary key referrals_pkey already guarantees uniqueness by id.
DROP INDEX IF EXISTS public.referrals_id_uidx;
