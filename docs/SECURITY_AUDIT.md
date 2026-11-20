# Security audit — Dream&Go V1.0

**Date:** 2026-11-20  
**Scope:** static repository review of the candidate branch `refactor/security-foundation`  
**Production changes:** none

## Findings

### SEC-CHAT-PROFILE-01 — chat service returned an unfiltered user document

**Status:** fixed in candidate branch.

`js/services/chat.service.js` previously returned `userDoc.data()` from `getUserProfile()`. The chat UI currently needs only public identity fields. The method now returns `toPublicProfile(uid, userDoc.data())`, using the same explicit allowlist as friend discovery and public profile rendering.

The projection is defense in depth only. It does not prevent Firestore from sending private fields to the browser. Server-side Firestore Rules must still restrict reads.

### SEC-RULES-01 — production Firestore Rules are not verifiable from this repository

**Status:** release blocker; owner/Firebase read-only confirmation required.

- No deployable root `firestore.rules` or `firebase.json` was found on the candidate branch during this review.
- The existing delivery plan records that permissive rules (`allow read, write: if true`) were previously found and that the owner later reported publishing emergency deny-all rules (`allow read, write: if false`).
- The live ruleset has not been read directly. Its current state must not be inferred from repository history or that earlier report.
- Do not deploy replacement rules, relax access, or modify production data as part of this code-only pass.

**Required evidence before proceeding:** export the exact active production rules in read-only mode; identify the deployed Firebase project and database; preserve the export with a timestamp; then build a rules matrix and emulator tests against the real data model.

## Required authorization matrix

The rules audit must explicitly test:

| Actor | Target | Expected |
|---|---|---|
| Guest | Any private user document, collection, or chat | Deny |
| User A | User A private profile and collections | Allow only documented owner operations |
| User B | User A private profile and collections | Deny |
| User A | Public profile projection of B | Allow only approved public fields |
| Non-participant C | A–B chat metadata and messages | Deny |
| Participant A | A–B chat | Allow only operations authorized by the final chat protocol |
| User A | B's friend requests / sent requests | Deny unless the exact protocol explicitly permits a narrowly scoped operation |

## Next steps

1. Obtain a read-only export of active production Firestore Rules and indexes.
2. Map every existing Firestore path and operation to the authorization matrix.
3. Add Emulator tests for guest, owner, second-user, and non-participant cases.
4. Run the same negative tests against isolated staging accounts.
5. Only after those gates, propose a reviewed rules deployment with backup and rollback plan.

No production rules, App Check enforcement, Cloud Functions, or user data were changed by this audit.


### SEC-FRIENDS-01 — client-side friend actions accepted caller-supplied identities

**Status:** hardened in candidate branch; server authorization still unverified.

- Friend service actions now require the supplied actor UID to match Firebase Auth's current UID.
- Request creation now uses a Firestore transaction, rejects an existing friendship, duplicate outgoing request, and reverse pending request, and writes both request views together.
- Accept/reject operations now transactionally verify that the incoming request exists and that its from/to/status fields match the expected participants before changing friendship state.
- Friend removal now requires an existing friendship record and performs both side deletions in a transaction.
- Friend/request list reads and client-side friend-count updates are scoped to the signed-in user.
- Client friend-count updates no longer attempt to write the other user's profile. A trusted server-side aggregate or a derived count is still needed if both profiles must show immediately consistent counts.
- Extracted pure identity/path validation into js/core/friend-action-policy.js and added tests/friend-action-policy.test.js. npm test discovers the new test automatically; npm run check syntax-checks the policy module.

**Limit:** these client-side guards are defense in depth, not authorization. Firestore Rules must independently enforce actor ownership, request direction/status, reciprocal friendship invariants, and protected stats fields. No rules export or production rules change was available in this pass.


### SEC-COLLECTIONS-01 — personal collection services did not bind caller UID to Firebase Auth

**Status:** client-side defense-in-depth added to candidate branch; production Rules remain the security boundary.

- Dreams, travels, books, movies, and restaurants services now verify that the requested owner UID equals the active Firebase Auth UID before list/read/create/update/delete/stat-refresh operations.
- Item update/delete/read operations reject malformed document IDs before constructing Firestore paths.
- Dream writes now pass through the existing `validateDreamInput()` policy. Updates load the current record, merge only the editable fields with submitted changes, validate the complete result, and write the normalized projection. Client-supplied protected or unknown fields are rejected.
- Dream list filters are restricted to known status and category values.
- Travel/book/movie/restaurant service syntax checks and the dreams service syntax check are part of `npm run check`.

**Limitations and remaining work:**

- These checks run in the browser and can be bypassed by a modified client. Firestore Rules must independently enforce owner-only access and field-level restrictions.
- Travel, book, movie and restaurant write payloads still need dedicated schema validators and field allowlists; this pass adds authenticated-owner checks but does not claim complete payload validation.
- No Firestore Rules were changed or deployed. The production ruleset remains unverified; see SEC-RULES-01.
- No live data or user records were accessed or modified.


**Implementation refinement:** extracted the shared `js/core/owner-access-policy.js` helper for exact authenticated-UID matching and single-segment Firestore document IDs. Added `tests/owner-access-policy.test.js`; `npm run check` includes the policy module. All five personal collection services consume the shared helper rather than maintaining separate implementations.


### SEC-COLLECTIONS-02 — achievement concurrency and private export ownership

**Status:** implemented on the candidate branch; requires CI and staging verification.

- Achievement reads and award checks now require the active Firebase Auth UID to match the requested profile.
- Achievement awards are calculated by a pure policy module and persisted inside a Firestore transaction. Concurrent award checks therefore re-read the latest profile state instead of overwriting each other's array updates.
- The policy sanitizes counters, ignores malformed records, normalizes legacy entries, removes duplicate IDs while retaining the highest level, and advances only one eligible level per check.
- Added regression tests for first awards, level progression, repeat checks, malformed counters, and duplicate legacy records.
- Fixed progress calculations for special achievements and missing counters; the collector target is explicitly five categories.
- Data export now requires the active owner UID and rechecks it after asynchronous reads and immediately before download, preventing an account switch during export from completing a download.

**Resolved 2026-11-20:** perfect_week now uses successful collection creation events from the rolling seven-day window. XP-capped events still count as real collection activity; friend additions and events older than seven days do not count.


**CI verification — 2026-11-20:** GitHub Actions run for commit `bc4684240093da4fd434504b44c551be6b00762d` completed successfully. `npm test`: 390 passed, 0 failed. `npm run check`: passed. Earlier intermediate commits in this pass were red while extracted-service test harnesses were being updated; the latest head is green.


### SEC-COLLECTIONS-03 — schema validation for travel, books, movies, and restaurants

- Added `js/core/collection-input-policy.js` with per-domain allowlists, required fields, enum validation, bounded text/numeric fields, date validation, nested budget validation, HTTPS-only image URLs, and bounded arrays.
- Create operations persist normalized allowlisted projections rather than spreading caller-provided objects. Update operations accept only allowlisted partial fields and validate them before Firestore writes.
- Added `tests/collection-input-policy.test.js` covering valid records, unknown/protected fields, invalid enum values, invalid URLs/dates, numeric bounds, and partial updates.
- Latest GitHub Actions run for `966bc3d9d75aa3f701abd4bb52feded4ff2ce5f7`: 395/395 tests passed; `npm run check` passed.

**Scope note:** these browser-side validators are defense in depth. Firestore Rules must independently enforce field-level constraints; the deployed rules are still not present in this repository branch and must be reviewed in Firebase Console before release.


### SEC-STATS-01 — client-written profile counters replaced with trusted recomputation

**Status:** candidate implementation and emulator coverage complete; not deployed.

- Added `refreshUserStatsV2`, an authenticated Firebase callable in `europe-west3` with App Check enforcement. It accepts no UID or counter payload; the server derives the caller UID from Firebase Auth.
- The server reads the caller's own travels, restaurants, movies, books, dreams and friends subcollections inside a Firestore transaction, recomputes status totals, ignores legacy `_init` placeholders, and updates only computed stats while preserving unrelated counters.
- Five personal collection services and the friend service now delegate counter refresh to the callable instead of writing `users/{uid}.stats` directly from the browser.
- Added pure policy tests, client delegation tests and a real Firestore Emulator transaction test.
- Latest Checks run on `42a0ad0e320d2f4ca7fa4678c54c132d86a5314c`: 401/401 tests passed; `npm run check` passed. The dedicated Firebase Emulator workflow passed on the implementation commit `42a0ad0e320d2f4ca7fa4678c54c132d86a5314c`: 5 isolated Firestore rules tests and 46 server/emulator transaction tests passed, 0 failed.

**Limitations:** this callable is candidate code and has not been deployed. Production Firestore Rules and App Check settings remain unverified. XP and achievement award paths have since been moved to server-authoritative candidate code; see SEC-XP-01 and SEC-ACH-01.


### SEC-XP-01 — client-authoritative experience rewards

**Status:** candidate server event pipeline implemented and emulator-verified; not deployed.

- Browser-side `LevelService.addXP()` no longer writes `stats.xp`. The app no longer submits arbitrary XP action names.
- Cloud Functions v2 document triggers award XP only after persisted records are created in the user's travels, restaurants, movies, books, dreams, and friends collections. Required record fields and status enums are validated server-side. Dream completion is a separate transition trigger.
- Each reward uses a stable event ledger entry and Firestore transaction, so duplicate trigger delivery cannot double-award XP.
- Added per-action daily limit (5 events) and total daily XP ceiling (300) to reduce farming with newly generated document IDs.
- Daily task progress and claims have since moved to server-owned transactions; see SEC-DAILY-01. Canonical task state and XP ledgers live outside client-owned user paths.
- Added unit and Firestore Emulator tests for idempotency, profile ownership, daily caps, missing profiles and dream status transitions.

**Compatibility/rollout:** XP values currently retained for collection actions: travel 50, restaurant 30, movie 20, book 25, dream 15, friend 40, dream completion 100. Message and login rewards are not awarded by this pipeline. Daily-task rewards are handled by the separate SEC-DAILY-01 transaction flow. Functions have not been deployed. Existing profile XP is preserved; no migration or production data changes were made.


### SEC-ACH-01 — browser-side achievement awards

**Status:** candidate server-side award path implemented and emulator-verified; not deployed.

- Extracted the achievement catalog into the pure shared module js/core/achievement-catalog.js; both the UI and trusted server use the same conditions and descriptions.
- AchievementsService is now read-only. Its legacy checkAndAwardAchievements() entry point is a no-op and cannot persist awards from the browser.
- refreshUserStatsV2 now calculates collection counters and achievement awards in the same Firestore transaction, writes both together, and returns only newly earned awards for UI notifications.
- The app displays award toasts from the trusted callable response and retains account-version checks so late responses from a previous session are ignored.
- Emulator test confirms awards are persisted and repeated refreshes do not issue duplicate levels.
- Latest head 64301219df2298e6c44d52f5a5e5a4ec504775ba: Checks 409/409 passed; Firebase Emulator 5/5 rules tests and 51/51 server/emulator tests passed.

**Resolved:** perfect_week now uses successful collection creation events in a rolling seven-day window, sourced from the server XP event ledger. Server functions are not deployed; the client/server rollout must be coordinated before merge.


**Final verification snapshot — 2026-11-20:** implementation commit 8b7843d065e8d6d8b0caecf74479355d3337029c passed 410/410 repository tests, 5/5 Firestore Rules tests, and 51/51 server/emulator tests. npm run check passed. Documentation-only commits followed. No production deployment or data mutation occurred.


### SEC-DAILY-01 — server-owned daily task lifecycle

**Status:** candidate implementation and emulator coverage complete; not deployed.

- Replaced client-generated assignments and client-written progress with `getDailyTasksV2`, deterministic server assignment of three tasks per UTC day, and Firestore create-event progress updates.
- The pool contains only six server-validated collection/friend creation events: travel, restaurant, movie, book, dream and friend. Ratings, reviews and chat messages remain excluded until their events can be validated server-side.
- Claims and the all-tasks bonus are authenticated App-Check-protected callables. A Firestore transaction verifies completion, records the claim, updates profile XP and applies the same 300 XP UTC-day ceiling as ordinary XP rewards. Partial remaining XP is persisted as the actual amount.
- Browser code cannot assign tasks, mutate progress or choose an XP amount. The old client-side update path is now a no-op and is no longer called by the app.
- **Security boundary:** canonical state is stored under top-level `serverDailyTasks/{uid}`; XP event and daily ledgers are stored under `serverXp/{uid}`. Candidate Firestore rules deny browser reads/writes to these paths. They are not stored beneath `users/{uid}`, where broad owner rules could accidentally expose server state.
- Added emulator coverage for assignment stability, duplicate event delivery, atomic claims, partial XP ceiling, bonus claims and browser denial of server-owned ledger paths.
- App Check browser bootstrap now initializes the configured reCAPTCHA Enterprise provider before protected callables are used.

**Rollout:** all code remains candidate-only. Production Firestore Rules, App Check enforcement, Functions deployment and the live client rollout must be reviewed together. UTC midnight is the explicit task reset boundary.


**Latest combined verification — 2026-11-20:** code implementation commit 88a128e8c3b635226cd6d0bb8d08d2e2307622a5 passed 415/415 repository tests, 6/6 candidate Firestore Rules tests, and 56/56 server/emulator tests. `npm run check` passed. Later commits 4ce66c254e38a8c739eb78afafb99f6d35c7dcbd and 248be52ee8970a7f732462c80fbf43661ebc8fc5 changed documentation only. No production Functions deployment, production Rules change, or user-data migration was performed.
