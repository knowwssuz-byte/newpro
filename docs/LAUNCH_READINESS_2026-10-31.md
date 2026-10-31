# Newpro production launch audit — 2026-10-31

## Financial test cleanup (performed)
- Backups: `launch_archive.deposit_transactions_snapshot_20261031` (35 rows) and `launch_archive.withdraw_requests_snapshot_20261031` (5 rows). Archive schema is inaccessible to `anon`/`authenticated`.
- Removed from live tables: 28 non-completed deposit rows (pending/cancelled/expired) and 5 pending withdrawal rows.
- Preserved in live ledger: 7 completed deposits (5 Stars, 2 Gift), all with external transaction identifiers; deleting them would risk payment replay and audit inconsistency.
- The cleanup intentionally did not change user balances, gift ownership or historical wager records.

## Important: release is not automatically approved
At audit time, 19 users held a combined 2,498,065 Stars, including balances potentially funded through historical test/admin operations. Seven completed deposits represented 123,338 credited Stars. Confirm which credits were actual provider payments, then reconcile each account/ledger before enabling live prizes or announcing a public real-money launch.
Do not simply set user.balance = 0 or delete completed transactions; that would invalidate inventory, game and referral histories.

## Safer production preflight
1. Check the seven completed deposits against original Telegram/TON provider receipts and maintain a unique processed external transaction record.
2. Reconcile user balances and prize ownership with admin ledger, deposit ledger, case wins, sells, upgrades, PVP, Dice and Rocket; approve migration for test accounts separately.
3. Keep a current database backup and a reversible migration plan. Verify that withdrawal clearing did not discard legitimate user claims.
4. Rotate admin and bot credentials using deployment secret management; use restricted/admin session access and rate limiting. Do not share credentials in frontend code, URLs or screenshots.
5. Confirm the Telegram webhook secret, callback query behavior, channel membership task and bot channel permissions.
6. Execute real two-account end-to-end smoke for Color Arena (joint stake, multiple gifts, winner payout, refund on solo game), X/O, Free Case cooldown, Upgrade and inventory sell/withdraw.
7. Test Stars and TON provider flows with minimum amounts, including idempotent duplicate webhook, expiry, timeout and failed/cancelled cases, before announcing any live payment feature.
8. Confirm latest GitHub CI test/build, visual smoke, Vercel production SHA and runtime error rates.
9. Reduce oversized assets (notably 5.6 MB feature images) and profile actual WebApp LCP on mid-range phones.
10. Do not publish an external public release announcement until financial reconciliation and provider verification are signed off.

## Scope of code hardening
- All npm dependencies are pinned to the exact tested lockfile version.
- The unused non-atomic case open fallback and its unprotected stock/balance writes were deleted.
- The browser admin now performs its header token check before parsing requests and blocks oversized uploads.
- The Home Arena shortcut continues to open Color directly, but its in-game mode selector keeps X/O Duel reachable.
- Mocked visual smoke is also triggered by main branch pushes.
