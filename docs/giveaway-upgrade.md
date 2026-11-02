# NewPro giveaway upgrade

Base reviewed: `7ba83eba5e98f107e821c3eb440f2fd44346fc8a` (main, 2 November 2026).

## Behaviour

- The primary tab requires an explicitly featured, unexpired live giveaway. Other events use compact cards and a detail view that restores list scroll and focus. Expired live events move to results with a waiting state.
- Prize media travels from the catalogue into a prize snapshot, through both list RPCs, into `GiveawayGiftMedia`. Only the large on-screen prize plays. Cards use static previews or a still frame of real Lottie data. Visibility, reduced motion, failed requests and fixed layout dimensions are handled independently.
- Paid entry shows the amount, current balance and remaining balance in an in-app dialog. Native dialog focus containment and an inert background accompany scroll locking and focus restoration. Free entry sends the operation directly.
- A synchronous client lock blocks double taps. An uncertain response preserves the request ID in session storage, scoped to the signed-in user. Recovery replays that ID even after navigation or the deadline; the existing database RPC performs the debit atomically and resolves duplicate operations before the deadline check.
- A post-commit balance read failure returns a successful entry and `balance: null`, never a fabricated zero. The client retains its previous balance and asks for refresh.
- First-place odds are weight / total weight. Small positive percentages display `<0.01%`. A separate own-rank card appears when the current user is outside the loaded page.
- The leaderboard uses stable anonymous entry keys and deterministic weight/join-time/user ordering. Each next page carries a count-and-weight revision. If new Stars or entrants change the ordering, the server returns page one with an explicit reset notice. Feed polling never races an append request or silently mixes revisions. This intentionally restarts a rapidly changing board instead of pretending it is a frozen snapshot.
- Admin separates list, editor and selected-event views. Draft edits validate an optimistic `updated_at` version under a row lock; prize replacement rolls back if any catalogue gift is invalid. A searchable media picker and up/down order controls replace the long select.
- A draft's `feature_on_publish` records intent without replacing the current live feature. Publication and live feature changes share an advisory transaction lock. The existing unique featured index remains the final constraint. If several drafts are marked, the one most recently published becomes the single live feature.
- Publish, draw, cancel and delivery use the shared in-app dialog. Delivery explicitly saves an administrator's record; it does not send a Telegram gift.

## Database rollout

No hosted schema or production balance was changed during implementation. Apply the migration before deploying this branch:

`supabase/migrations/20261102163022_giveaway_experience.sql`

It adds prize animation snapshots and draft feature intent, backfills existing prize media, replaces create/list/feature RPCs, and adds atomic draft update, publication and revision-checked leaderboard RPCs. It does not alter the winning algorithm or debit balances. Privileged functions remain security invoker with an empty search path and EXECUTE granted only to service_role.

The old repository did **not** contain create, join, draw, cancel, delivery, admin-list or public-list definitions. These were inspected using authorized read-only access to NewPro and recovered, together with giveaway table definitions and constraints, into `supabase/baselines/giveaway.sql`. This baseline is for an isolated/new environment whose `users`, `gift_library` and pgcrypto dependencies already exist. Run it before the giveaway migrations. Do not run it as an indiscriminate production reset. It contains schema and functions only, with no user rows or seed values.

This restores the giveaway subsystem, not a complete fresh-install schema for every unrelated NewPro feature. Existing eight-digit legacy migration names should be normalized in a separate migration-history maintenance task. The new timestamped filename was created by the Supabase CLI.

For rollback, revert the application branch first. The added columns and functions may remain; the old application ignores them. Do not delete contributions, entries or seed records.

## Verification

Run `npm run test:giveaway` for domain, API and PostgreSQL workflow tests. The route tests execute the actual production handler bodies with isolated dependencies, preserving their validation and response logic. PGlite supplies a real PostgreSQL engine in memory; its missing pgcrypto primitives are supplied by the test fixture using PostgreSQL SHA-256 and UUID randomness. No remote credentials are used.

Run `npm run build`, then `npm run test:giveaway:browser`. Install Chromium with `npx playwright install chromium`, or pass `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for an existing executable. The browser script starts the production server locally and intercepts **all** API requests. Giveaway requests run through the production handlers and the isolated database. Telegram bootstrap is a test fixture, and the catalogue WebP/TGS are real media copied read-only from NewPro's public gift assets.

The suite checks 360, 390, 430 and 1280px screens. Screenshots and the machine-readable result go to `artifacts/giveaway/` (ignored by git). It never makes a real Stars transaction, publishes a live giveaway, or sends a gift.

Limitations: PGlite is single-process, so it cannot prove multi-connection lock behaviour under load. Real Telegram iOS/Android WebViews, live deployment variables, the live migration application and actual gift fulfilment require a deployment/device check. The existing seed-based draw algorithm was inspected and exercised; this is not an independent fairness audit.

Baseline before changes: 185 unit tests, 179 passed and 6 failed; repository lint had 28 errors and 39 warnings. Five failures are unrelated stale assertions (case odds, local PvP routing, home navigation and withdrawal UI). The sixth was the giveaway test that required `window.confirm`; it is replaced by behavioural tests and a guard against native dialogs. Final counts are recorded in the PR validation notes.

## Final local results

| Check | Result |
| --- | --- |
| `npm run build` | Passed (production Next.js build) |
| `npm run test:giveaway` | 22 / 22 passed |
| Browser → actual route handlers → isolated PostgreSQL | Passed at 360, 390, 430 and 1280px |
| Changed giveaway component/API/helper lint | 0 errors, 0 warnings |
| Full `npm test` | 194 / 199 passed; 5 pre-existing unrelated failures remain |
| Full repository lint | 27 errors, 34 warnings; all remaining errors are in existing Arena, ColorArena, Dice, WebAppClient and vendor code |
| `git diff --check` | Passed |

Browser cases also cover actual TGS playback, offscreen/hidden/reduced-motion pausing, a real static fallback on failed animation, no layout shift when all media fails, keyboard focus containment/restoration, cancellation without debit, double-click locking, replay after navigating away, all 65 participant rows, revision reset on a reordered board, a skewed device clock, expiry during confirmation, admin draft repair, feature publication, cancellation, draw and delivery-record confirmation. No native browser dialogs were opened.

The unrelated baseline failures remain in `case-reel-zero-preview.test.mjs`, `case-stars-image-upload.test.mjs`, `gift-pvp-ui.test.mjs`, `home-arena-games-separation.test.mjs` and `inventory-withdraw-referral-nav.test.mjs`. They were recorded before changes; gameplay, profile, inventory and unrelated navigation were not rewritten to satisfy stale source assertions.

## File map

| Area | Main files |
| --- | --- |
| User navigation and payment recovery | `app/webapp/GiveawayHub.jsx`, `lib/giveawayUi.mjs` |
| Prize card, media and participants | `GiveawayEventCard.jsx`, `GiveawayGiftMedia.jsx`, `GiveawayOddsBoard.jsx` and CSS modules under `app/webapp/` |
| Shared accessible confirmation | `app/webapp/GiveawayDialog.jsx` and its CSS module |
| Admin list/editor/preview/details | `app/admin/GiveawayAdmin.jsx`, `app/admin/giveaway-admin.css` |
| Authenticated API behaviour | `app/api/giveaway/route.js`, giveaway branches of `app/api/browser-admin/route.js`, `lib/giveawayServer.mjs` |
| Existing app integration | `app/webapp/WebAppClient.jsx` passes the current user ID for scoped recovery storage |
| Database recovery and changes | `supabase/baselines/giveaway.sql`, `supabase/migrations/20261102163022_giveaway_experience.sql` |
| Regression checks | `tests/giveaway*.test.mjs`, `tests/fixtures/giveaway*`, `scripts/giveaway-smoke.mjs`, `.github/workflows/giveaway.yml` |

## Screenshots from isolated test data

- [User page, 390px](giveaway-preview/user-390.png)
- [Other giveaways, 390px](giveaway-preview/others-390.png)
- [In-app payment confirmation](giveaway-preview/payment-390.png)
- [Admin editor with live preview, 1280px](giveaway-preview/admin-editor-1280.png)
