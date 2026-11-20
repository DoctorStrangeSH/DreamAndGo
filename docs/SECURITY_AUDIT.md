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

**Known product logic issue:** the achievement named `perfect_week` currently evaluates lifetime totals, not events within a seven-day window. It is not safe to claim this is a weekly achievement until event timestamps and a rolling-window policy are implemented. This is tracked as a product correctness item, not silently changed during this security pass.


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
- Latest Checks run on `42a0ad0e320d2f4ca7fa4678c54c132d86a5314c`: 401/401 tests passed; `npm run check` passed. The dedicated Firebase Emulator workflow is running for the same commit and must be green before this block is closed.

**Limitations:** this callable is candidate code and has not been deployed. It does not yet move XP (`stats.xp`) or achievement awards out of client code. The current `LevelService.addXP()` still writes a client-selected UID and action directly, and achievement persistence still runs from the client. These are separate authorization/integrity blockers. Production Firestore Rules and App Check settings remain unverified.
