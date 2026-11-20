# DreamAndGo — release readiness for PR #1

Last review: 2026-11-20. Branch: `refactor/security-foundation` → `main`.

## Current decision

**HOLD — not ready to merge to production.** The repository is already serving real users. This PR currently changes 235 files (latest PR metadata; totals may continue to change), including auth, routing, chat, profile and personal collections. CI passing is necessary but not sufficient.

## Confirmed automatically

- [x] GitHub reports no merge conflicts for PR #1 at reviewed head `1ffcd60cc6374690d180e7beae4cc2835c48ca06`.
- [x] Both `test` checks succeeded on the reviewed head.
- [x] `chat-rules` check succeeded.
- [x] `screenshots` check succeeded, including responsive offline Atlas preview.
- [x] Candidate signup v2 rollout is explicitly disabled in `js/app.js` (enabled=false, backendReady=false, legacyMigrationVerified=false).
- [x] No actual production Firestore rules were changed by this PR: emulator rule files live under `tests/firebase-emulator/`.

## Release blockers (must be demonstrated before merge)

- [ ] In an isolated staging Firebase project, validate sign-in, sign-out, refresh and account recovery with a test account.
- [ ] Verify existing users can still read their own travels, books, restaurants, movies, dreams and profile after a page refresh.
- [ ] Verify a second signed-in account cannot read or change the first account's private collections, chats or profile-private fields.
- [ ] Exercise chat send, receive, pagination and retry in two browsers using staging accounts.
- [ ] Exercise create/edit/delete of each personal collection and failure retry, including mobile widths 320px and 390px. Verify reload persists changes.
- [ ] Confirm the current production Firestore rules, indexes, App Check enforcement and Cloud Functions are compatible with the new browser code. Emulator candidate rules are **not** proof of deployed rules.
- [ ] Review all changes to `js/modules/auth/`, `js/services/auth.service.js`, `js/modules/chat/`, `js/services/chat.service.js`, `js/core/router.js` and `js/app.js` for regressions and accidental exposure of private data.
- [ ] Take a recoverable backup/export of Firestore before any live rules migration. Do not deploy candidate rules or change enforcement as part of a front-end merge.
- [ ] Record a production smoke-test owner and a rollback operator before merge.

## Safe rollout

1. Keep development in `refactor/security-foundation`. Do not merge while any blocker remains.
2. Validate on staging with separate test data. Do not run destructive test writes against production users.
3. Review the final diff and rerun every required GitHub check on the exact release commit.
4. Record the previous `main` SHA, release SHA and deployment URL.
5. Merge in a controlled window, then check login, private data, collections, chat and mobile navigation using non-sensitive test accounts.
6. If a regression is found, revert the release commit(s) via a new commit/PR, verify restored site behavior, and investigate Firestore impact separately. Never use force-push or rewrite production history to roll back.

## Notes

The screenshot workflow uses an **offline preview**, not an authenticated production browser journey. Candidate emulator rules are not installed production security rules. This document is a gate, not a claim that staging or live smoke tests have already passed.


## Security follow-up — 2026-11-20

Reviewed and hardened the remaining notification and global-search renderers on `refactor/security-foundation`:

- Notification title and message are HTML-escaped before rendering.
- Notification IDs are escaped for attribute context; navigation targets are restricted to an explicit internal-route allowlist. Dynamic profile routes accept only constrained UID characters.
- Notification icon and color classes/values are selected from fixed allowlists rather than persisted notification fields.
- Global search titles, type labels and descriptions are escaped; route, icon and color values are allowlisted.
- Search requests use a generation guard and current-user check so late responses cannot repaint a closed modal or a different account's UI.
- Search cache is scoped to the authenticated UID to prevent cross-account reuse.
- Added unit coverage for route allowlisting and HTML escaping; added syntax checks for the hardened modules.

These are targeted fixes, **not completion of the full XSS audit**. Remaining renderers and all other user-controlled HTML sinks still require review.

### Latest candidate commit

- Always use the live PR head SHA when evaluating checks; this document intentionally avoids pinning a SHA that becomes stale after its own update.
- PR #1 remains open; mergeability is not confirmed.
- GitHub combined status and PR-filtered workflow-run lookup returned no checks/runs for this exact SHA at review time. Do not interpret an empty result as a passing CI run.
- Staging verification, real production rules review, two-account browser tests, backup and rollback ownership remain release blockers.


## Account-isolation follow-up — 2026-11-20

Additional asynchronous UI isolation fixes on the candidate branch:

- Chat list subscriptions capture the UID that created the listener. Queued snapshots are ignored after an account switch, and retry actions are bound to the same UID.
- Re-subscribing to the chat list explicitly tears down the previous listener first.
- Profile loading uses a monotonically increasing request token and captured signed-in UID. A slower response cannot replace a newer profile route or repaint after the active account changes.
- `npm run check` now includes syntax checks for the chat and profile modules.

These changes reduce stale-response and cross-account UI leakage risks. They do not replace server-side Firestore authorization or a real two-account browser test. CI execution remains unconfirmed until GitHub reports checks for the current PR head.


## Security audit follow-up — 2026-11-20

- Fixed SEC-CHAT-PROFILE-01: ChatService.getUserProfile() now returns the shared toPublicProfile() allowlist instead of exposing the raw Firestore user document to chat callers. The existing npm run check already syntax-checks js/services/chat.service.js.
- Added docs/SECURITY_AUDIT.md with the finding, required authorization matrix, and evidence gates.
- SEC-RULES-01 remains a release blocker: no deployable root firestore.rules / firebase.json was found on the candidate branch, and active production rules have not been read directly. The previously reported emergency deny-all state is not treated as current verified evidence.
- No production Firebase rules, App Check settings, Functions, or user data were changed.
- The current PR head has no reported commit status or workflow runs available yet; CI is not claimed as passing.


## Personal collection access pass — 2026-11-20

- Added exact Firebase Auth UID checks to DreamsService, TravelService, BookService, MovieService, and RestaurantService for collection reads, writes, item reads, deletes, and client-side stats refreshes.
- Added single-segment Firestore document ID validation for item-level operations.
- DreamsService now validates create/update payloads with the existing dream input policy and restricts list filters to supported values.
- Extracted shared policy to js/core/owner-access-policy.js and added tests/owner-access-policy.test.js.
- npm run check now syntax-checks all five collection services and the shared policy.
- Remaining release gates: dedicated schema validation for travel/book/movie/restaurant writes, Firestore Rules enforcement and export review, staging tests, and confirmed CI on the live PR head. Client-side checks are defense in depth only.


### Additional integrity work — 2026-11-20

- Achievement awards are now transactionally persisted and guarded by the active Firebase Auth UID.
- Added pure award policy with regression coverage for duplicate/legacy records, invalid counters, and repeated award checks.
- Achievement progress no longer throws for special achievements or missing statistics.
- JSON backup export is bound to the active owner and aborts if the account changes during collection reads.
- Resolved 2026-11-20: `perfect_week` now counts successful collection creation events within the rolling seven-day window.


### CI recovery — 2026-11-20

- Updated service-extraction test harnesses to inject the shared authenticated-owner and document-ID policies rather than relying on removed instance helpers.
- Updated friend validation tests to exercise the extracted shared policy directly.
- Updated legacy achievement test expectations to reflect backward-compatible level-1 normalization.
- Latest GitHub Actions result: 390/390 tests passed; `npm run check` passed on `bc4684240093da4fd434504b44c551be6b00762d`.


### Collection write schema pass — 2026-11-20

- Added strict allowlist and field validation for travel, books, movies, and restaurants.
- Service create paths now persist normalized payloads; update paths reject unknown/protected fields and invalid values before writes.
- Added regression coverage for nested budgets, ratings, statuses, genres, page progress, movie metadata, cuisine, dates, HTTPS photos, and partial updates.
- Latest CI: 395 tests passed, 0 failed; syntax checks passed on `966bc3d9d75aa3f701abd4bb52feded4ff2ce5f7`.
- Firestore Rules review remains a release blocker; client-side validation does not replace server-side authorization.


### Trusted profile statistics — 2026-11-20

- Added candidate `refreshUserStatsV2` callable; Firebase Auth UID is the sole source of ownership and App Check is required.
- Server recomputes travel, restaurant, movie, book, dream and friend counters in one Firestore transaction. Legacy `_init` documents are excluded; unrelated stats are preserved.
- Client services no longer write these collection counters directly to the private user profile.
- CI on `42a0ad0e320d2f4ca7fa4678c54c132d86a5314c`: 401 tests passed, 0 failed; syntax checks passed.
- Dedicated Firebase Emulator workflow passed on implementation commit `42a0ad0e320d2f4ca7fa4678c54c132d86a5314c`: 5 rules tests + 46 server/emulator tests passed, 0 failed. The latest `4c55d7f86c8a92c089374758a8f392ded29d5666` commit contains documentation-only changes; a rerun was in progress at the time of this note.
- XP and achievement award writes have candidate server-authoritative implementations. Cloud Functions have not been deployed; production Rules/App Check remain release blockers.


### Server-authoritative XP — 2026-11-20

- XP is granted from Firestore create/update triggers for collection records and friendship records; dream completion requires a real status transition.
- Each event is idempotent through a stable server-derived ledger key and Firestore transaction.
- Limits: 5 rewards per action/day and 300 XP total per UTC day.
- Browser XP writes are disabled. Daily-task XP/bonus claims are visibly pending and cannot grant XP until task progress is server-verified.
- Candidate implementation is not deployed. Staging and production Rules/App Check verification remain mandatory.
- Final verification on implementation head 8b7843d065e8d6d8b0caecf74479355d3337029c: 410/410 Checks tests; 5/5 Firestore Rules tests; 51/51 server/emulator tests. The latest commits after that head are documentation-only.


### Server-authoritative achievements — 2026-11-20

- Shared achievement catalog extracted for browser rendering and server evaluation.
- Browser-side achievement persistence disabled; the server computes and persists awards atomically with profile statistics.
- App notifications are driven by newly awarded records returned from the trusted callable and guarded against account switches.
- Emulator verified repeated refreshes do not duplicate awards.
- Latest verified implementation head 64301219df2298e6c44d52f5a5e5a4ec504775ba: 409/409 Checks tests; 5/5 Firestore rules tests; 51/51 server/emulator tests.
- Not deployed. Production Firebase Functions/App Check/Rules rollout remains a hard release gate.


### Verification snapshot — 2026-11-20

- Checks on implementation commit a150f2fee1e40a012f5e989168584806450bdf2c: 411 passed, 0 failed; npm run check passed.
- Firebase Emulator on the same implementation commit: 5 Firestore Rules tests and 51 server/emulator tests passed, 0 failed. XP triggers also reject malformed collection records before awarding.
- Later change f25821a699a62747662dbbca3b5637eba31ceb39 only consolidates imports; its emulator rerun was in progress.
- No production Functions deployment, Firestore Rules change, or live user-data migration was performed.


### Server-owned daily tasks — 2026-11-20

- Server assigns three deterministic tasks per UTC day; progress is derived from schema-validated Firestore creation events.
- Claims and the completion bonus are transactional, idempotent, and share the 300 XP/day ceiling.
- Only travel, restaurant, movie, book, dream and friend creation tasks are enabled. Rating/review/chat tasks are deferred.
- Canonical task state is stored under serverDailyTasks/{uid}; XP event and daily ledgers under serverXp/{uid}. Browser clients are denied access in candidate emulator rules.
- App Check browser bootstrap is wired for the protected callables.
- Not deployed. Production rules and live App Check must be verified before rollout.


### Combined verification snapshot — 2026-11-20

- Code implementation head 88a128e8c3b635226cd6d0bb8d08d2e2307622a5: 415/415 repository tests; npm run check passed.
- Firebase Emulator: 6/6 candidate Firestore Rules tests and 56/56 server/emulator transaction tests passed.
- Later commits 4ce66c254e38a8c739eb78afb99f6d35c7dcbd and 248be52ee8970a7f732462c80fbf43661ebc8fc5 are documentation-only.
- No production deploy or live user-data changes.


### Username registry rehearsal — verified 2026-11-20

- Migration logic extracted to `server/username-backfill.js`; CLI remains dry-run by default and requires an explicit registration-freeze acknowledgement for apply.
- Emulator confirms dry-run is read-only, apply is idempotent and creates only missing reservations, collisions block writes, and the helper never activates the registry.
- Latest implementation head `def09284616fedcea822b3a28eeda9cf59b5f30a`: 415/415 repository tests, 6/6 Rules tests, 59/59 server/Auth/Firestore emulator tests; `npm run check` passed.
- Production backup, real-data dry-run, independent audit, registration freeze, staging browser QA and manual readiness activation remain outstanding.


### Notification lifecycle and XSS follow-up — 2026-11-20

- Notification subscriptions are now torn down on logout/account switch and re-init; generation/UID guards reject queued stale snapshots.
- Added notification lifecycle regression tests for teardown, account isolation and malformed snapshots.
- Targeted review covered notifications, global search, chat bubbles, friend cards, achievements and the primary personal collection/profile renderers. User text is escaped and dynamic enums/routes/icons/colors are allowlisted in reviewed paths.
- Shared modal content and empty-state action parameters remain trusted-markup APIs and must not receive raw user input.
- Full XSS audit remains open until every HTML sink and modal/form template has been reviewed.


### Security audit follow-up — 2026-11-20

- [x] Targeted credential-pattern scan completed for 20 high-risk current-branch files; no common private-key/token patterns found in that sample. Full tracked-file and Git-history scan remains open.
- [x] Confirmed candidate Firestore rules are isolated under `tests/firebase-emulator/`; no production root rules/config files are present in this branch.
- [ ] Production Firestore Rules remain a hard blocker: current candidate files are test-only and intentionally deny portions of the product. Create a complete ruleset from the approved V1.0 data model and verify every user flow in the emulator before any production deployment.
- [ ] Validate Firebase API-key restrictions, App Check enforcement and Functions deployment in staging.


### Firestore V1 access matrix — 2026-11-20

- [x] Added `docs/FIRESTORE_ACCESS_MATRIX.md` based on inspected client services and server callable/trigger implementations.
- [x] Classified private profile, five personal collections, friends/requests, notifications, legacy chat, Chat V2, public profiles, username registry, XP, daily tasks and migration/system documents.
- [x] Documented current legacy incompatibilities: client-generated notifications for arbitrary recipients, cross-user friendship writes, legacy chat writes to both user indexes, and username search over private `users`.
- [ ] Confirm exact V1 schemas and product decisions before authoring production Rules.
- [ ] Obtain the actual deployed Rules and sanitized live schema inventory.
- [ ] Implement and test the complete production Rules set in Emulator; candidate rules remain test-only.
- [ ] Staging test with two accounts, backup, rollback plan and manual production rollout.


### Read-only recovery Rules negative tests — 2026-11-20

- [x] Extended owner-read Emulator coverage to deny owner writes to social, notification, chat and daily-task documents in recovery mode.
- [x] Added direct-path deny checks for server-owned XP/tasks, username registry/reservations, chat pairs, public profiles and Chat V2 records.
- [x] CI passed on the audited test/doc HEAD (`df122f4d484d12128ee146da5097c96c78723862`, run `44778054402`). This remains a recovery prototype and does not close the production Rules blocker.


### Firestore V1 data schema audit — 2026-11-20

- [x] Added `docs/FIRESTORE_V1_DATA_SCHEMAS.md` from actual validators and write services for dreams, travels, books, movies and restaurants.
- [x] Recorded exact input fields, limits, enums, nested values and service-added timestamps/defaults.
- [x] Flagged inconsistent current `isPublic` defaults across collections; public flags do not grant access to private user documents.
- [ ] Product decision required for public visibility before public projection or Rules implementation.
- [ ] Emulator positive/negative tests for all four not-yet-modeled collection schemas remain open.


### Public profile consent blocker — 2026-11-20

- [x] Server and client projection helpers require explicit `publicProfileEnabled === true`; missing/false is private.
- [x] Public profile migration skips accounts without explicit opt-in and checks username collisions across all accounts.
- [ ] Owner-facing privacy setting and owner-only Firestore Rules are not yet implemented.
- [ ] Emulator coverage for opt-in/opt-out transitions and direct public projection reads is required before enabling profile endpoints or migration.
- **Release status remains HOLD.** Do not deploy public profile endpoints or run the migration until the consent UI and Rules are verified.


### Explicit public-profile consent hardening — 2026-11-20

- [x] Public profile projection is fail-closed unless `publicProfileEnabled === true` on the owner's private profile.
- [x] Direct profile lookup conceals non-public profiles as not-found; exact username lookup returns no projection.
- [x] Create-only migration skips non-opted-in accounts and checks case-insensitive username collisions across all accounts.
- [x] Unit tests cover explicit opt-in, opt-out, private lookup and collision cases.
- [x] CI passed on HEAD `515c9861f2d49895c34bfc027d5fbac3347261f2` ([run 44780842923](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44780842923)).
- [ ] The owner-facing privacy setting and Firestore Rules for changing the opt-in flag are not implemented.
- [ ] `FriendsService.getUserByUsername` still queries `users` directly from the browser; migrate it to the App-Check-protected callable before enforcing private-user read rules.
- **Decision:** keep public profile endpoints and migration disabled until the UI, Rules and callable client cutover are tested together.


### Public profile client cutover — 2026-11-20

- [x] Friend search now uses the App-Check protected exact username callable.
- [x] Friend, request and sent-request lists load public projections through a bounded batch callable (up to 50 UIDs per request).
- [x] Other-user profile page reads use the server projection; direct private user document reads remain owner-only in the profile module.
- [x] Unit tests cover batch filtering, private-profile omission and client cutover.
- [ ] Run emulator/staging two-account journey and verify deployed App Check configuration before rollout.
- [ ] Add the explicit owner privacy toggle and server-owned visibility update path.


### Public profile consent UI and server gate — 2026-11-20

- [x] Settings now expose an explicit public-profile switch; missing flag is rendered as private/off.
- [x] Switch writes only through authenticated App Check callable `setPublicProfileVisibilityV2`; no direct browser update of the privacy flag.
- [x] Opt-out is immediately available. Opt-in requires completed username registry backfill and a reservation owned by the caller.
- [x] Server policy checks the caller's own profile, registry readiness, canonical username and reservation ownership.
- [x] Unit tests cover valid opt-in, immediate opt-out, invalid input, missing profile, and UI/callable wiring.
- [ ] Run Firebase Emulator and staging two-account tests for visibility transitions, search, direct lookup and private-field isolation.
- [ ] Complete production registry backup/dry-run/backfill before enabling public profiles for any account.


### Verification note — public profile privacy control

- [x] Root CI `test` job passed on implementation HEAD `8a570eeee68fad84574ded2bd8bdf7297fd18ad1` ([run 44796782146](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44796782146)).
- [ ] Emulator/staging two-account journey remains outstanding; production rollout remains blocked on username registry backup/dry-run/backfill and live Rules/App Check verification.


### Public profile consent abuse regression tests

- [x] Added emulator assertions that direct browser updates/creates cannot set `publicProfileEnabled`, including attempts to set it true or false.
- [x] Added client/server projection assertions that the consent flag itself is never exposed.
- [ ] Firebase Emulator workflow must pass on the final updated HEAD before this area is marked verified.
