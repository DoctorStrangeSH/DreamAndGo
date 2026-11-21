# Security audit — Dream&Go V1.0

**Date:** 2026-11-20  
**Scope:** static repository review of the candidate branch `refactor/security-foundation`  
**Production changes:** none

## Findings

### SEC-CHAT-PROFILE-01 — chat service returned an unfiltered user document

**Status:** fixed in candidate branch.

`js/services/chat.service.js` previously returned `userDoc.data()` from `getUserProfile()`. The chat UI currently needs only public identity fields. The method now returns `toPublicProfile(uid, userDoc.data())`, using the same explicit allowlist as friend discovery and public profile rendering.

The projection is defense in depth only. It does not prevent Firestore from sending private fields to the browser. Server-side Firestore Rules must still restrict reads.

### SEC-RULES-01 — production Firestore Rules confirmed deny-all by owner

**Status:** owner explicitly confirmed the supplied deny-all rules are published in Firebase Console. Active project/database identity and a timestamped export have not yet been independently captured.

- The published rules are a recursive catch-all with `allow read, write: if false`.
- Therefore all Firestore document reads and writes are denied to guests and authenticated users, across all collections and subcollections.
- This is fail-closed and protects against unauthorized client access, but it also blocks all Firestore-backed application functionality. Firebase Auth sign-in itself may still work; Firestore profile creation, personal collections, chat, friends, notifications and any client-side Firestore reads/writes will fail unless routed through an authorized server endpoint.
- Treat this exact deny-all ruleset as the current rollback baseline. Do not relax or replace it until the active Firebase project/database is identified, the full path/schema inventory is reconciled, and least-privilege Rules pass Emulator plus two-account staging tests.
- No production rules were changed by this audit.

**Next evidence:** Firebase project ID (not credentials), confirm the Firestore database is the default database, and preserve the active ruleset/export with a timestamp before any proposed change.

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


**Username registry rehearsal verification — 2026-11-20:** implementation head `def09284616fedcea822b3a28eeda9cf59b5f30a` passed 415/415 repository tests and `npm run check`. Firebase Emulator passed 6/6 isolated Rules tests and 59/59 server/Auth/Firestore emulator tests, including dry-run, explicit freeze gate, idempotent backfill apply, case-insensitive collision blocking, active-registry protection, two-account Auth signup/reconnect and duplicate-name competition. Emulator server suites now run serially because multiple integration tests intentionally exercise the shared registry control document. No production backup, migration, flag activation or deployment was performed.


### SEC-UI-01 — notification subscription lifetime and XSS sink review

**Status:** notification lifecycle fix implemented; targeted renderer review performed; full application XSS inventory remains open.

- Notification widget now owns an explicit subscription generation and owner UID. Re-initialization tears down the previous listener, and queued snapshots are ignored after logout, account changes, or widget teardown.
- App auth transitions explicitly destroy the notification widget subscription before clearing or replacing the active account UI.
- Notification payloads are normalized to an array of non-null records before rendering and badge calculation.
- Reviewed notification and global-search renderers: text is HTML-escaped; icons, colors and navigation routes use allowlists. Reviewed chat bubbles, friend cards, achievements, movie/book/travel/restaurant/dream cards and own-profile collection summaries for dynamic text interpolation; reviewed fields are escaped or reduced to fixed allowlisted values.
- Raw markup parameters in shared `UIComponents.createModal({ content })` and `createEmptyState({ action })` remain trusted-caller APIs. They must only receive static application markup or markup assembled from correctly escaped/allowlisted values; never pass raw user content.
- Added regression tests for notification listener replacement, cross-account queued callbacks, teardown and malformed snapshots.

**Not complete:** every remaining HTML sink and modal/form template still requires a file-by-file review, especially less frequently used paths and dynamically assembled markup. This targeted review is not a claim that the entire XSS audit is closed.


### SEC-LEVEL-01 — untrusted XP could stall or inject markup into the level widget

**Status:** fixed in candidate branch; verified by CI on implementation HEAD `5cef355c105477008f1f2ed017d17baaec791184` and documentation-only HEAD `066e9e797092f84b521270991201830b279894cd`.

- The previous XP-to-level calculation used an unbounded loop over a Firestore profile value. A non-finite value such as `Infinity` could keep the loop running indefinitely.
- The level widget also rendered the raw XP value into an HTML template. A malformed string in the profile field could therefore become markup.
- Extracted a pure bounded policy in `js/core/level-policy.js`: values are converted to finite, non-negative safe integers, and the level is calculated in constant time with a square-root formula.
- `LevelService` now normalizes XP before returning it to the widget and uses the bounded policy for level/progress calculations.
- Added regression coverage for malformed values, infinities, negative values, maximum numeric values and exact level thresholds. Added the policy to `npm run check`.

**Verification required:** green repository tests and syntax checks on the exact candidate HEAD. No production rules, functions, user data or deployed configuration were changed.


### SEC-NOTIFY-01 — arbitrary client notification creation — 2026-11-21

**Status:** client-selected notification creation removed; trusted friend, achievement and private-message event sources plus isolated Rules coverage are implemented and CI/Emulator-verified. Production Rules and staging authorization remain open.

- The former `NotificationsService.addNotification(userId, data)` wrote directly to `users/{userId}/notifications` and accepted both recipient UID and payload from the browser.
- Removed `addNotification` and the unused client helper methods for friend requests, friend acceptance, messages, achievements and level-up notices. Repository search found no external call sites for those helper methods.
- Notification subscriptions and read-state mutations now require the active Firebase Auth UID to match the requested owner. Notification IDs are validated before path construction, and queued snapshots are ignored after an account switch.
- Added `tests/notifications-service-security.test.js` to guard against reintroducing client creation helpers and cross-account access paths.
- This is defense in depth, not an authorization boundary. Production Firestore Rules are still absent from the repository and have not been read from Firebase Console.

**Verification:** friend, achievement and private-message event sources are covered by candidate transaction tests; isolated notification Rules passed 7/7 tests and server/Auth/Firestore Emulator tests passed 59/59. Root Checks passed 461/461 tests with syntax checks for 254 files. See SEC-NOTIFY-02, SEC-NOTIFY-04 and SEC-NOTIFY-05.

**Remaining:** obtain/review the active production Rules, integrate the access contract into the complete production Rules configuration, and validate with two staging accounts and App Check. Do not deploy or loosen Rules based on isolated candidate fixtures.


### SEC-NOTIFY-02 — trusted friendship event notifications — 2026-11-21

**Status:** implemented in candidate code; transaction and isolated Rules Emulator coverage passed. Production Rules integration and staging verification remain open.

- `mutateFriendshipV2` already requires Firebase Auth, App Check and derives the actor exclusively from `request.auth.uid`.
- The friendship transaction now creates a fixed-schema `friend_request` notification for the target user in the same transaction as the paired request records.
- A valid `accept` action creates a fixed-schema `friend_accepted` notification for the original requester in the same transaction as the symmetric friendship records and request deletion.
- Recipient paths and payload fields are generated by server code. The callable accepts no notification recipient, text, route, icon, type or timestamp from the browser.
- Deterministic per-actor notification document IDs make retries idempotent for each event slot and prevent duplicate documents from repeated delivery.
- Regression tests assert exact recipient paths and allowlisted payload values.

**Verification:** Root Checks passed 461/461; isolated notification Rules passed 7/7 and server/Auth/Firestore Emulator tests passed 59/59. Trusted achievement and private-message event sources are documented in SEC-NOTIFY-04 and SEC-NOTIFY-05.

**Remaining:** integrate the tested access contract into the complete production Rules configuration and run the complete notification flow with two staging accounts and App Check. Do not treat candidate code as permission to deploy Functions or loosen production Rules.


### SEC-NOTIFY-03 — stale friendship request notices — 2026-11-21

**Status:** candidate transaction and regression tests updated; Root Checks and Firebase Emulator workflows passed.

- Sender cancellation deletes the corresponding recipient-side request notification in the same transaction as request-index deletion.
- Recipient acceptance/rejection deletes the incoming request notification in the same transaction as request resolution.
- Acceptance additionally creates a separate fixed-schema notice for the original requester.
- This avoids leaving an actionable-looking notification after the request no longer exists. The server remains the only notification creator.

**Verification:** latest Root Checks passed with 461/461 tests and syntax validation of 254 JavaScript files; Firebase Emulator passed 7/7 isolated Rules tests and 59/59 server/Auth/Firestore Emulator tests (runs 44894173436 and 44893915020).

**Remaining:** obtain/review active production Rules and validate notification delivery/read-state in staging with two accounts and App Check. The isolated fixture does not confirm deployed production authorization.


### SEC-NOTIFY-04 — trusted achievement notifications — 2026-11-21

**Status:** implemented in candidate server transaction; transaction/Emulator coverage and isolated notification Rules have passed. Production Rules integration and staging remain open.

- `refreshUserStatsV2` derives the target UID from Firebase Auth and calls `refreshUserStatsTransaction`.
- When the trusted achievement policy returns newly awarded achievement levels, the same Firestore transaction updates the user's achievement state and writes a fixed-schema notification under that user's own `notifications` collection.
- The client cannot submit a recipient, title, message, route, icon, achievement ID, level or timestamp. Those values come from server-computed achievement results and the fixed notification template.
- Deterministic IDs include achievement ID and level, making a retried refresh idempotent and allowing a later level-up to produce its own notification.
- The Emulator test checks the exact notification fields and confirms a repeated refresh does not remove or duplicate the awarded notice.

**Verification:** Root Checks passed 461/461; isolated notification Rules passed 7/7 and server/Auth/Firestore Emulator tests passed 59/59. Achievement payload and repeat-refresh idempotency are covered.

**Remaining:** integrate the access contract into production Rules and validate with two staging accounts and App Check. No production Rules or Functions were changed.


### SEC-NOTIFY-05 — trusted private-message notifications — 2026-11-21

**Status:** implemented in candidate message transaction; retry idempotency, isolated Rules, Root Checks and Emulator suites have passed. Production Rules integration and staging acceptance remain pending.

- `sendPrivateMessageV2` authenticates the sender and delegates to `sendPrivateMessageTransaction`; the transaction validates the chat participant pair and both block directions before writing.
- A new message creates a fixed-schema notification under the other participant's own `users/{recipientUid}/notifications` collection in the same transaction as the message, sequence, previews and unread counter.
- The client cannot choose recipient, notification type, title, icon, color, route, sender ID or timestamp. The preview is bounded to 120 characters from the already validated message text.
- Stable `message_{serverMessageId}` IDs and the existing deterministic message retry check ensure one notification per accepted message, not one per callable attempt.
- Emulator test asserts the exact payload and verifies that repeated sends do not create duplicate notices or increment unread twice.

**Verification:** an isolated notification Rules fixture now tests owner-only reads, guest/cross-user denial, server-only create/delete and one-way owner read-state updates with immutable event metadata. The fixture is intentionally not production Rules.

**Verification:** Root Checks passed 461/461; isolated notification Rules passed 7/7 and server/Auth/Firestore Emulator tests passed 59/59. The fixture is not production Rules.

**Remaining:** obtain/review the active production Rules, integrate the tested notification contract into the complete production Rules configuration, and validate with two staging accounts and App Check. The message/chat v2 backend remains candidate-only and must not be deployed or connected to the legacy chat UI as part of this change.


### SEC-CALLABLE-01 — private chat callables did not enforce App Check — 2026-11-21

**Status:** fixed in candidate code; regression test passed. Root Checks passed 462/462 tests and syntax validation passed for 255 JavaScript files on implementation HEAD `1b7122d747b2bac336312e1caf925c5c4b3039c5` ([run 44894482895](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44894482895)). Firebase Emulator workflow also passed on the same implementation HEAD: 7/7 Firestore Rules tests and 59/59 server/Auth/Firestore Emulator tests ([run 44894482871](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44894482871)). This does not prove that deployed Functions have been updated.

- The six candidate private-chat callable endpoints (`createPrivateChatV2`, `sendPrivateMessageV2`, `getPrivateMessageStatusV2`, `markPrivateMessageReadV2`, `getPrivateChatUnreadV2`, `getPrivateChatHistoryV2`) previously omitted `enforceAppCheck: true` while other V2 callable endpoints required it.
- All six now explicitly require Firebase App Check in their callable options.
- Added `server/callable-app-check.test.js`, which scans exported callable declarations in `server/index.js` and fails if any lacks `enforceAppCheck: true`.
- Static source audit confirms all 17 exported V2 callable declarations currently require App Check.

**Remaining:** confirm the regression test and full CI on the exact candidate HEAD; verify App Check enforcement and token acceptance on the deployed Firebase project; deploy Functions only after the complete production Rules, staging, migration and rollback gates are approved. No Functions were deployed by this change.



### SEC-COLLECTIONS-01 — personal collection CRUD access contract — 2026-11-21

**Status:** source inventory and access matrix expanded; client-input regression tests added. Production Rules are still unavailable and must not be inferred from the isolated emulator fixtures.

- Audited the current direct browser CRUD paths for dreams, travels, books, movies and restaurants, plus the existing legacy chat writes.
- Added the concrete field allowlists, nested structures, enum/range/size constraints and server-generated metadata to section 13 of docs/FIRESTORE_ACCESS_MATRIX.md.
- Identified inconsistent legacy visibility metadata: dreams are created with isPublic=false; travels, books and restaurants with isPublic=true; movies have no isPublic field. This metadata must not grant access to private user subcollections. Firestore Rules cannot redact individual fields from a document.
- Identified notes contract differences: travel notes are validator-accepted and editable; book/movie/restaurant notes are initialized as empty strings but are not in their update validators; dreams do not define notes.
- Added regression tests rejecting client-supplied isPublic, createdAt and updatedAt fields across all five collection input validators.

**Verification required:** root CI for the new tests; then add the full five-collection owner/guest/cross-user Rules cases only after the real production Rules and indexes are exported and reviewed. No production Rules or Functions were changed.



### SEC-CHAT-PRIVACY-01 — chat list read raw private user profiles — 2026-11-21

**Status:** fixed in candidate client code; regression test passed. Root Checks passed on implementation/test HEAD `0642afbffeee2a510e281c28a97541f2fd262bc6`: 465/465 tests, 0 failures; syntax validation passed for all 255 JavaScript files ([run 44896246436](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44896246436)).

- The legacy chat service fetched users/{partnerUid} directly from the browser, then removed private fields in JavaScript with toPublicProfile(). Client-side projection is not an authorization boundary: the full Firestore document had already been delivered to the browser.
- Chat list loading now gathers unique partner UIDs and requests their profiles through the existing App Check protected getPublicProfilesV2 callable in bounded batches, reusing the allowlisted server projection and privacy opt-in check.
- The single-profile helper now uses the same callable; direct reads of another user's private users/{uid} document were removed from ChatService.
- Added a service-contract regression test that rejects raw users/{uid} reads and requires the callable batch path.

**Remaining:** verify the client cutover with two staging accounts and App Check; verify private profiles intentionally fall back to the generic chat label; keep production Rules owner-only for users/{uid}. Legacy chat message/index migration and cutover remain separate release gates. No production Rules or Functions were changed.



### SEC-REALTIME-PRIVACY-01 — realtime social subscriptions read raw private profiles — 2026-11-21

**Status:** candidate client cutover implemented and regression suite passed. Root Checks passed on implementation/test HEAD `174e0d06174369fb48290850e3db14c74f3e93ab`: 467/467 tests, 0 failures; syntax validation passed for all 256 JavaScript files ([run 44896463096](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44896463096)). No production Rules or Functions were changed.

- The realtime chat/friends/incoming-request/sent-request subscriptions previously called getUserProfile() once per row; that helper fetched the raw users/{uid} document and only then projected public fields in browser code.
- Replaced per-row raw document reads with one deduplicated getPublicProfilesByIds() request per snapshot (the client helper splits batches into groups of 50). The server callable returns only the explicit public profile projection and enforces Auth, App Check, quota and public-profile opt-in.
- Kept the snapshot generation gate so stale asynchronous profile batches cannot repaint a newer snapshot.
- Added tests to forbid getDoc/toPublicProfile in RealtimeService and require the callable batch path for all four social/chat subscriptions.

**Remaining:** two-account staging for public/private profile behavior with App Check. Production users/{uid} Rules must remain owner-only. No raw private profile document should be exposed to another account.



### SEC-SIGNUP-LEGACY-01 — legacy registration still requires unsafe client profile writes — 2026-11-21

**Status:** confirmed release blocker; deliberately not changed because disabling the legacy path before migration would break registration for current users. Signup V2 remains fail-closed.

- js/app.js explicitly sets all Signup V2 rollout gates to false: enabled=false, backendReady=false, legacyMigrationVerified=false.
- With the rollout disabled, AuthService.signUpWithEmail uses the legacy browser path: it queries users by username/usernameNormalized, creates users/{uid} with client-supplied profile fields including stats/achievements/privacy, and creates _init subcollection documents. Login also writes lastLogin from the browser on the legacy path.
- The username availability preflight queries the users collection directly. If Rules permit that query, Firestore returns complete matching user documents, not a redacted username-only projection; if Rules deny it, legacy registration fails. This cannot be made safe by client-side sanitization.
- registerProfileV2 and the server-owned username reservation flow exist, but rollout remains intentionally disabled until the registry is backed up, legacy usernames are audited/backfilled, complete Rules are reviewed, and staging acceptance passes.

**Decision:** do not loosen users Rules to preserve the legacy browser signup and do not enable Signup V2 based only on emulator tests. First complete read-only production inventory, registry backup/dry-run/backfill plan, and two-account staging. Keep the release on HOLD until this migration gate is satisfied.


### SEC-USERNAME-BACKFILL-01 — require explicit backup acknowledgement before apply — 2026-11-21

**Status:** implemented and verified. Firebase Emulator workflow passed on implementation/test HEAD `e5f6aef2323c8e1a0175eaee323d3975de06aca7`: 7/7 Rules tests and 59/59 server/Auth/Firestore Emulator tests, 0 failures ([run 44896946136](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44896946136)). Root Checks passed on later candidate HEAD `8a5f59829ff932d2d03ab11a523d656dd386b4bc`: 469/469 tests, 0 failures; syntax validation passed for all 257 JavaScript files ([run 44897158331](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44897158331)).

- The username reservation backfill previously required an explicit registration freeze for apply mode but did not separately require backup confirmation.
- Added a second fail-closed input, `backupVerified: true`, to the migration helper. Apply now requires a verified-backup acknowledgement, frozen registration window and server timestamp provider.
- The administrative CLI now requires both `--confirm-registration-frozen` and `--confirm-backup-verified` before it can enter apply mode.
- Added emulator assertions that missing either acknowledgement is rejected, while a fully acknowledged apply remains create-only, idempotent, postflight-verified and leaves the registry closed.

**Limit:** the backup flag is an operator acknowledgement, not machine-verifiable evidence. Production backup creation, restore validation, maintenance freeze and migration approval remain independent release gates. No production data was accessed or modified.


### SEC-PERSONAL-READS-01 — owner guards for search and level reads — 2026-11-21

**Status:** candidate fix and regression test passed. Root Checks passed on candidate HEAD `8a5f59829ff932d2d03ab11a523d656dd386b4bc`: 469/469 tests, 0 failures; syntax validation passed for all 257 JavaScript files ([run 44897158331](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44897158331)).

- SearchService previously accepted any supplied UID and queried that user's travels, restaurants, movies, books and dreams. Added an authenticated-owner check before starting, before/after each asynchronous collection read, before caching, and before returning results.
- LevelService previously fetched users/{uid} without checking the active Firebase Auth UID. Added owner checks before the read and after the asynchronous read, discarding results if the active account changes.
- Added a regression test requiring owner checks and preserving the user-scoped collection paths.

**Limit:** these client guards are defense in depth only. Firestore Rules must still enforce owner-only reads on the server. No Rules or production data were changed.


### SEC-PROFILE-STATUS-01 — guard prototype-key lookups in profile status labels — 2026-11-21

**Status:** implemented and verified. Root Checks passed on final candidate HEAD `bfa96394231e0c52c720cc3d7ba2f01cb1235600`: 470/470 tests, 0 failures; syntax validation passed for all 258 JavaScript files ([run 44897710078](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44897710078)).

- Profile dream status labels are now selected only when the status is an own key of the fixed label map. Unknown values, including inherited object keys such as `constructor` and `__proto__`, fall back to the safe `dreaming` label.
- Added a source-contract regression test to prevent reintroducing prototype-chain lookup.
- This is a rendering robustness hardening; no stored data or server authorization behavior changed.

### SEC-ACH-01 — own-key validation for achievement milestone maps — 2026-11-21

**Status:** implemented and verified. Root Checks passed on the implementation commits: 470/470 tests, 0 failures; syntax validation passed for all 258 JavaScript files. See [implementation check](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44897935694) and [milestone-map check](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44897933324).

- The milestone map is a plain object, so direct bracket lookup could resolve inherited keys such as `constructor` or `__proto__` for malformed achievement IDs.
- Lookup now accepts only string IDs that are own keys of the fixed milestone map; unknown and malformed IDs return no milestone.
- Added regression coverage for inherited keys and null input.
- The achievement catalogue remains the source of supported IDs; this change does not alter earned achievements or stored data.

### SEC-FIREBASE-APPCHECK-01 — callable inventory and production Rules boundary — 2026-11-21

**Status:** source audit completed; candidate CI passed; production configuration remains an external release blocker.

- Enumerated every exported `onCall` declaration in `server/index.js`: all 17 currently specify `enforceAppCheck: true`. The existing regression test `server/callable-app-check.test.js` enforces this invariant.
- Confirmed the repository has no root `firestore.rules` or `firebase.json` on either `main` or `refactor/security-foundation`.
- `tests/firebase-emulator/firebase.json` is isolated to test fixtures and points at `chat.rules`; it is not a production deployment configuration. The other rule files are also deliberately partial fixtures.
- No production Rules were inferred, generated, or deployed. Obtain the active Firebase project Rules/config through an authorized read-only export before drafting the production candidate.
- Latest candidate CI passed on `65849741d3893b0d181b526d3887812257256984`: 470/470 tests and syntax checks for all 258 JavaScript files ([run 44898060339](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44898060339)).

**Release gate:** two-account Emulator/staging authorization tests against the complete Rules contract, active App Check enforcement verification on deployed callable endpoints, and a reviewed backup/rollback plan remain open.


### SEC-STORAGE-01 — Firebase Storage excluded from V1.0 scope — 2026-11-21

**Status:** owner confirmed Firebase Storage is not configured because enabling it requires a paid upgrade.

- V1.0 will not require Firebase Storage or a paid Storage upgrade.
- Do not add Storage deployment configuration, Storage Rules, upload flows or attachment features to the V1.0 acceptance criteria.
- Any existing UI that implies upload/storage capability must be reviewed and either disabled or clearly marked out of scope before release.
- Reconsider Storage only as a separately approved post-V1.0 enhancement; no upgrade is requested now.



### SEC-RULES-IMPACT-01 — published deny-all blocks all direct Firestore client paths — 2026-11-21

**Status:** impact inventory completed; least-privilege design and Emulator suite pending.


### Published deny-all impact and client compatibility inventory — 2026-11-21

Owner confirmed the recursive deny-all Rules are published. Therefore, if the web app is currently connected to this Firestore database, all direct Firestore SDK operations fail with permission denied, including:

- `users/{uid}` profile read/create and `lastLogin` writes; username uniqueness queries over the entire `users` collection; initial placeholder writes (`_init`) in travels/restaurants/movies/books/dreams/friends/messages.
- Owner CRUD and list queries in the five personal subcollections: dreams, travels, books, movies and restaurants.
- Owner notification list/read-state updates.
- Friend list reads from the owner subcollections.
- Legacy chat index reads/writes under both participants' `users/{uid}/chats/{partnerUid}`, direct message writes/edits/deletes under `chats/{chatId}/messages`, and local conversation deletion.
- Any other direct Firestore client operation; callable functions using Admin SDK are not governed by Firestore Rules, but retain their own Auth/App Check/validation requirements.

**Important architecture conflicts discovered during the path inventory:**

1. `AuthService` still performs client-side username queries against the global `users` collection and creates the user profile plus `_init` placeholders directly. These paths conflict with the planned server-owned username registry and must be migrated before enabling restrictive production Rules.
2. Legacy chat writes cross both participants' private chat indexes from one client. A secure owner-only rule cannot safely allow a sender to update the recipient's index. Chat V2/server-side cutover is required; do not add broad exceptions.
3. `books`, `travels`, and `restaurants` currently write `isPublic: true` by default, while the V1.0 access matrix keeps personal subcollections owner-only. This field does not itself grant access under Rules. Public visibility must use a separate approved projection and explicit consent, or be removed/disabled; never open the parent private document.
4. `notifications` client updates only `read`, a candidate for a narrowly scoped owner update after schema validation. Server-created payloads must remain immutable to clients.
5. Personal collection services call `refreshUserStats`; profile stats and achievements remain server-owned and must not become writable through general profile Rules.

No production rules or user data were changed. This inventory is source-derived and still needs full validator/schema review plus Emulator tests.



### Firebase project identity — owner supplied — 2026-11-21

- Firebase Project ID: `dream-and-go`
- Project number: `185825350373`
- Web app nickname: `Dream&Go Web`
- Web App ID: `1:185825350373:web:749c60926a0c6294f7fa0c`
- Source: owner-provided Firebase Console screenshot.
- The project identity is recorded for local Emulator configuration and future reviewed deployment instructions only. This does **not** verify the active Firestore database ID, export a timestamped copy of the published Rules, or authorize any production deployment.
- The screenshot does not establish whether the app is connected to the default Firestore database or a named database. Confirm that separately before any Rules candidate is applied.


### Firestore database target confirmed — 2026-11-21

- Firebase Project ID: `dream-and-go`
- Firestore database ID: `(default)` (owner-confirmed in Firebase Console)
- The local Emulator / candidate Rules work must target the default Firestore database in project `dream-and-go`.
- This confirms the target identity for planning only. It does not authorize deployment or change the published recursive deny-all Rules.
- Before any production change, retain a timestamped export of the currently published deny-all Rules and verify the project/database selector in the Firebase Console one final time.


### SEC-CLIENT-CUTOVER-01 — server-backed signup and Chat V2 are not yet active in the application — 2026-11-21

**Status:** confirmed static integration gap; rollout intentionally disabled; no production change made.

- `js/app.js` constructs `AuthService` with `enabled: false`, `backendReady: false`, and `legacyMigrationVerified: false`. Therefore `canUseSignupV2()` is false, and the browser remains on the legacy signup path.
- The legacy `AuthService.signUpWithEmail()` still queries the global `users` collection for username uniqueness, then creates `users/{uid}` and `_init` documents directly from the browser. Those operations are denied by the owner-confirmed published deny-all Rules. Do not enable broad profile create/list rules to make this legacy path work.
- `registerProfileV2` and `getRegistrationStateV2` callable endpoints exist and require Auth plus App Check, but V2 signup is deliberately not wired on by default. The server registration function also remains closed by `system/usernameRegistry` until backfill readiness is proven.
- `js/app.js` registers the existing `ChatModule`; `js/modules/chat/chat.js` imports legacy `ChatService`. `js/services/chat-v2-callable.service.js` explicitly says it is candidate-only and is not imported by legacy chat. Chat V2 callable backend and UI/session primitives therefore do not constitute an integrated user-facing Chat V2 release.
- Legacy `ChatService` directly writes message documents and both participants' chat indexes. This is incompatible with a secure owner-only authorization model and must not be enabled by broad client write rules.
- The existing candidate signup flow and Chat V2 components remain rollout-gated. Keep both disabled until schema migration, username registry backfill, callable deployment, App Check verification, chat-history migration, client integration, and two-account staging are complete.

**Recovery consequence:** do not publish a partial allowlist that restores only profile reads or generic authenticated writes. First complete the end-to-end client/server cutover; then test the exact candidate Rules against all MUST flows. The deny-all rules remain the safe production baseline in the meantime.


### SEC-FIREBASE-APPID-01 — Console and repository Web App ID confirmed — 2026-11-21

**Status: resolved by owner confirmation.** The owner explicitly supplied `1:185825350373:web:749e60926a0c6294f7fa0c`, which exactly matches `js/config/firebase.js` on `refactor/security-foundation`. Project ID and project number also match. No Firebase config change is needed. This confirms the configured Web App ID only; it does not prove that App Check is enforced in production or that deployed callable endpoints have been verified. Those staging gates remain open.

### SEC-PRIVATE-VISIBILITY-01 — remove ambiguous public flags from new private records — 2026-11-21

- Removed automatic `isPublic` writes from create operations in `dreams`, `travels`, `books`, and `restaurants`; `movies` already did not write the flag.
- Added `tests/private-collection-visibility.test.js` to prevent future writes of `isPublic` in any of the five private collection services.
- Existing legacy documents are untouched. Historical values are not authorization and must not grant public reads.
- Updated the access matrix, V1.0 data schema and delivery plan.
- CI: 471/471 tests passed, 0 failures; syntax checks passed for 259 JavaScript files ([run 44901620982](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44901620982)).
- No production Rules, Firebase configuration, or user data were changed.


### SEC-DREAM-RULES-SCHEMA-01 — align Emulator dream rules with current write contract — 2026-11-21

- Removed the stale `isPublic` requirement from the dream Rules fixture. New client writes do not contain this field.
- Emulator tests now assert both `isPublic: true` and `isPublic: false` are rejected on create and update.
- This remains an isolated recovery/test fixture, not production Rules. The other four personal collections remain write-denied in this fixture.


### SEC-RULES-SCOPE-02 — current Emulator fixtures are not a complete V1.0 Rules candidate — 2026-11-21

**Status: open release blocker.**

- Re-inspected `tests/firebase-emulator/owner-read.rules` and its tests on candidate HEAD `2b938f4513400fc11fb2be3ec61690056c626f00`.
- The fixture allows owner reads for selected private paths and has a narrowly validated dream create/update/delete path. Generic writes for travels, books, movies and restaurants remain explicitly denied; this is intentional recovery-mode behavior.
- The separate notification fixture tests owner-only reads, immutable event fields, server-only create/delete and one-way owner read-state updates. It does not constitute the full application Rules set.
- The access matrix and `FIRESTORE_V1_DATA_SCHEMAS.md` are the source contracts for a separate complete candidate. Implement schema-specific allowlists and immutable-field checks; do not enable broad owner writes or infer authorization from legacy `isPublic` fields.
- Current HEAD has no reported combined status checks or workflow runs in GitHub. Prior successful CI/Emulator runs must not be attributed to this HEAD.
- No production Rules, Firebase settings, Functions, or user data were changed.


### SEC-COLLECTION-BOOK-01 — partial page-count updates — 2026-11-21

**Status: client-side mitigation implemented; authoritative Rules enforcement open.**

- `validateBookInput(..., { partial: true })` could not compare a one-field page update with the persisted counterpart.
- Added `validateBookUpdateInput(existing, updates)` to merge only the page-bound fields for invariant validation while retaining the allowlisted partial payload.
- `BookService.updateBook` now fetches the existing book and rejects missing records before writing; it rejects updates that would make `currentPage > totalPages`.
- Regression tests cover valid partial changes, current-page overflow, lowering total pages below the current page, malformed legacy counters and unrelated updates.
- A read followed by a separate write is not atomic. Firestore Rules must independently compare `request.resource.data.currentPage` and `request.resource.data.totalPages` with the resulting document before this invariant can be considered secured against concurrent clients.
- No production Rules or user data were changed. Exact-HEAD CI remains unverified.


### SEC-COLLECTION-BOOK-02 — preserve create validator wiring — 2026-11-21

- During follow-up review, detected that the BookService import had been narrowed to `validateBookUpdateInput` while `addBook` still called `validateBookInput`. This would cause a runtime ReferenceError on book creation.
- Restored both named imports and added `tests/book-service-validator-wiring.test.js` to guard imports and both call sites.
- This is a source-level regression guard; it does not replace running the full test suite.
- No production Rules or user data were changed.


### SEC-COLLECTION-BOOK-03 — close page-count read/write race — 2026-11-21

**Status: client-side race mitigation implemented; Firestore Rules enforcement open.**

- The previous BookService implementation read a document and then issued a separate update. Two concurrent clients could both validate against stale page bounds.
- Replaced the separate read/write pair with Firestore `runTransaction`: read the current document, validate the merged page bounds, then update within the same transaction. Firestore retries conflicting transactions, preventing the client-side check from silently relying on a stale read.
- The wiring regression test now asserts transactional read, validation and update call sites.
- This does not replace server authorization. Firestore Rules must independently validate resulting document fields and immutable timestamps.
- No production Rules, Firebase settings or user data were changed.


### SEC-COLLECTION-TRAVEL-01 — avoid false failure after committed writes — 2026-11-21

- `TravelService.addTravel` previously awaited a derived-statistics refresh inside the same outer try/catch as the primary `addDoc`. If the write committed but stats refresh failed, the method returned `success: false`, encouraging a duplicate retry.
- `updateTravel` had the same issue after a committed `updateDoc`.
- Both methods now isolate statistics refresh in a best-effort try/catch and preserve success for the already-committed primary write. The secondary failure is logged for diagnosis.
- Added source-level regression tests for both paths and validator tests confirming that a partial `budget` update must replace the complete validated nested map (planned, spent, currency); unknown keys and invalid ranges are rejected.
- This change does not grant additional Firestore permissions and does not replace authoritative Rules validation.


### SEC-COLLECTION-MOVIE-01 — avoid false failure after committed writes — 2026-11-21

- `MovieService.addMovie` and `updateMovie` previously awaited the derived-statistics refresh inside the same outer try/catch as the primary Firestore write. A statistics failure after a successful write could return `success: false` and invite a duplicate retry.
- Both paths now isolate statistics refresh as best-effort work and preserve success after the primary write is confirmed. Secondary failures are logged.
- Added `tests/movie-service-write-result.test.js` for both paths.
- Extended movie validator tests to reject impossible calendar dates and duplicate genre IDs. Existing allowlists continue to constrain TMDB metadata, HTTPS artwork URLs, bounded ratings, country maps and status values.
- This is client reliability/input hardening only; Firestore Rules remain the authorization boundary and are not yet complete.


### SEC-COLLECTION-RESTAURANT-01 — avoid false failure after committed writes — 2026-11-21

- `RestaurantService.addRestaurant` and `updateRestaurant` previously awaited derived-statistics refresh inside the same outer try/catch as the primary Firestore write. A secondary refresh failure after a successful write could return `success: false` and encourage duplicate retries.
- Both paths now isolate statistics refresh as best-effort work and preserve success after the primary Firestore write is confirmed. Secondary failures are logged.
- Added `tests/restaurant-service-write-result.test.js` for both paths.
- Expanded validator regression coverage for cuisine/status allowlists, impossible visit dates, nullable visit dates, rating bounds, favorite dish count and photo count. HTTPS-only photo validation remains enforced by the shared URL-list validator.
- Client validation is not authorization. The final Firestore Rules candidate must independently enforce field allowlists, enum values, types, ranges, list bounds, timestamps and owner-only access.


### SEC-COLLECTION-CRUD-01 — consistent derived-statistics failure handling — 2026-11-21

**Status: client-side reliability hardening implemented; execution evidence pending.**

- Audit found that dreams and books, plus delete operations across the collection services, could return `success: false` after the primary Firestore write/delete had already committed if the subsequent statistics refresh failed.
- Added `updateUserStatsBestEffort(userId)` to all five collection services (dreams, travels, books, movies, restaurants). It catches and logs secondary statistics errors.
- Routed each create/update/delete operation through this wrapper. Primary Firestore failures still return failure; only the derived statistics refresh is best-effort.
- Added a regression test that checks all 15 CRUD paths use the wrapper and do not directly await the throwing statistics method.
- This does not establish atomic consistency of derived statistics. A future server-side trigger or transactional aggregate design may be considered only if already included in the V1 scope; do not expand scope here.
- No Firestore Rules, production configuration or user data were changed.


### SEC-RULES-TRAVEL-01 — schema-specific travel Rules candidate — 2026-11-21

**Status: candidate authored; Emulator execution pending.**

- Added a test-only `collections-v1.rules` fixture with explicit `travels` create/update/delete authorization. The generic owner collection matcher remains write-denied, so books/movies/restaurants and other categories are not accidentally opened.
- Travel documents require the V1 field allowlist, required title/type/status/timestamps, bounded optional strings, known enums, exact budget map keys and numeric bounds, rating bounds, and bounded HTTPS photo lists.
- Create requires both timestamps to equal `request.time`; update preserves `createdAt` and requires `updatedAt == request.time`; only the path owner can mutate or read.
- Added positive/negative Emulator test cases. The Emulator suite has not yet been executed on this HEAD, so no pass is claimed.
- The fixture deliberately does not modify root `firestore.rules`, Firebase Console, live documents or production settings.


### SEC-RULES-BOOK-01 — schema-specific books Rules candidate — 2026-11-21

**Status: candidate authored; Emulator execution pending.**

- Added owner-only create/read/list/update/delete for the private books subcollection to the isolated candidate fixture.
- The candidate validates exact top-level fields, required title/author/status/notes/timestamps, status and genre allowlists, year/page/rating bounds, current-page versus total-pages invariant, review/quote bounds, immutable `createdAt`, and `updatedAt == request.time`.
- Added positive and negative Emulator test coverage for owner CRUD, guest/second-account isolation, invalid enum/genre, page overflow, excessive lists, unknown fields and timestamp forgery.
- This candidate does not modify root production rules, Firebase Console or live data. Emulator execution has not yet been performed.


### SEC-RULES-MOVIE-01 — schema-specific movies Rules candidate — 2026-11-21

**Status: candidate authored; Emulator execution pending.**

- Added owner-only create/read/list/update/delete for the private movies subcollection in the isolated candidate.
- Rules validate exact top-level fields; required TMDB ID/title/status/notes/timestamps; bounded metadata; HTTPS poster/backdrop URLs or null for missing TMDB artwork; rating/count/runtime/budget ranges; known genre IDs; production-country maps with exact keys and uppercase ISO alpha-2 codes; and timestamp immutability.
- Added positive/negative Emulator coverage for owner CRUD, guest/second-account isolation, unknown fields, malformed IDs/status/genres/countries, list bounds, non-HTTPS artwork, invalid date shape, numeric bounds and timestamp forgery.
- Client validator now accepts null artwork and rejects malformed country codes, with regression coverage.
- The Rules candidate does not modify production Firestore Rules or live data. Emulator execution has not yet been performed.
- Date Rules validate format and broad month/day ranges; strict calendar validation remains in the client validator because Rules cannot conveniently reproduce full calendar semantics.


### SEC-RULES-RESTAURANT-01 — schema-specific restaurants Rules candidate — 2026-11-21

**Status: candidate authored; Emulator execution pending.**

- Added owner-only create/read/list/update/delete for the private restaurants subcollection.
- Rules validate exact top-level fields, required name/cuisine/status/notes/timestamps, cuisine/status allowlists, optional address and visit date, bill/rating bounds, bounded favorite-dish list, review length, HTTPS photo list and immutable/server timestamps.
- Added positive/negative Emulator coverage for owner CRUD, guest/second-account isolation, unknown fields, invalid enum/date values, numeric bounds, list bounds, non-HTTPS photos and timestamp forgery.
- The fixture remains test-only. Root production Rules, Firebase Console and live data were not modified. Emulator execution has not yet been performed.


### SEC-RULES-DREAM-01 — dreams CRUD coverage and visibility integrity — 2026-11-21

**Status: candidate and tests authored; Emulator execution pending.**

- Added `dreams-v1.rules.test.mjs` for owner create/read/list/update/delete, guest and second-account denial, schema bounds, invalid enums, nested step validation, unknown fields and server timestamp integrity.
- Tightened the candidate: a newly created dream may omit `isPublic` or set it to `false`, never `true`; when present, visibility must be boolean; updates must preserve the existing visibility value.
- Explicitly tested legacy compatibility: a pre-existing `isPublic: true` record can still be edited without changing visibility, while client attempts to change that field are denied.
- Existing client validation remains in `js/core/dream-input-policy.js` and is covered by `tests/dream-input-policy.test.js`.
- The test is included in the Emulator package script. No Emulator pass is claimed; production Rules and Firebase Console remain untouched.


### SEC-RULES-DREAM-02 — preserve absence of legacy visibility field — 2026-11-21

A second static review found that the first immutability condition could allow a client to add `isPublic` to a legacy document where the field was absent. Corrected the update predicate: the field must remain absent when absent before, or remain exactly equal when it already existed. The Emulator test's existing private-document mutation case exercises this regression. Emulator execution is still pending.


### SEC-CI-EMULATOR-01 — repeatable Rules test execution — 2026-11-21

- Added a dedicated GitHub Actions workflow using Node.js 22, Java 21 and Firebase CLI Emulator execution.
- It runs the complete `tests/firebase-emulator` suite and is scoped to pushes on `refactor/security-foundation` plus relevant pull-request file changes.
- Workflow committed; first execution/result is pending. No test pass is claimed until GitHub reports a successful run.
- Workflow is test-only and does not deploy or modify Firebase production Rules.


### SEC-CI-EMULATOR-02 — isolate parallel emulator suites — 2026-11-21

Static review found that the five collection suites reused one Firebase Emulator project ID while Node's test runner can execute files concurrently. Assigned a unique project ID to each collection suite and separated the existing Auth signup journey from the chat Rules suite. This prevents test fixtures/rules and seeded documents from colliding across concurrent test files. The change is static-reviewed only; CI execution remains unconfirmed.


### SEC-RULES-CLIENT-CONTRACT-01 — client payload and Rules compatibility test — 2026-11-21

Added `client-rules-contract.test.mjs`. It imports the actual five client validators, builds create payloads matching service behavior (including server timestamps and service-generated `notes` on books/movies/restaurants), and attempts to write each document against the isolated V1 Rules fixture. This tests a previously uncovered integration boundary between client validation and Firestore Rules rather than testing each schema independently. The suite is wired into npm test. Execution remains pending; this is not a test pass or production Rules approval.


### SEC-RULES-CLIENT-CONTRACT-02 — update/delete lifecycle coverage — 2026-11-21

Extended the client-to-Rules integration suite beyond create. For each of dreams, travels, books, movies and restaurants, the test now performs a representative partial update with a server `updatedAt`, verifies that rewriting `createdAt` is denied, and verifies owner deletion. The test remains pending execution; no runtime pass is claimed.


### SEC-LEGACY-COLLECTIONS-01 — historical document compatibility — 2026-11-21

**Status: gap reproduced in isolated Emulator; migration not implemented.**

Static service review found no explicit legacy normalization path in the five collection list/update services. A new Emulator test seeds historical-shape records in dreams, travels, books, movies and restaurants, each missing `createdAt`/`updatedAt` and containing old field/status names.

The test documents three behaviors:
- Owner direct reads and deletes remain allowed under the staged fixture.
- Existing list queries use `orderBy('createdAt', 'desc')`; Firestore excludes documents that do not contain that field, so these records do not appear in the normal list.
- Strict V1 update matchers reject the incomplete legacy documents. This is safer than weakening field validation, but means the records require a planned migration or explicit compatibility adapter before release.

No legacy records were accessed or modified in production. The fixtures are synthetic. The test is not yet executed in Emulator/CI. Required follow-up: define a dry-run inventory, versioned normalization rules, backup/rollback, and list-service behavior for missing timestamps. Do not deploy strict V1 Rules until this gap is resolved.


### SEC-LEGACY-COLLECTIONS-02 — privacy-safe offline inventory tool — 2026-11-21

Added an offline metadata auditor for the five personal collections. It reports aggregate counts for missing timestamps, missing required fields, unknown fields, invalid status values and malformed records. The report deliberately excludes document IDs and field values. The CLI reads a local minimized JSON snapshot and has no Firebase connection or write capability.

This does not establish the actual production legacy schema: the earlier Emulator fixtures are synthetic. Real legacy mappings must not be guessed from those fixtures. The next evidence required is a minimized owner-controlled export containing only collection name, optional local identifier, field names, coarse types and timestamp presence/shape. Do not upload personal titles, notes, reviews, photos, URLs, emails or other content. Once real field/status names are known, prepare a separate versioned dry-run migration planner with explicit mapping, idempotency, backup and rollback. No migration or production access has occurred.


### SEC-LEGACY-COLLECTIONS-03 — metadata-only inventory input — 2026-11-21

Tightened the offline auditor so it no longer accepts raw document `data` or document IDs. Each record must contain only collection name, a map of field names to coarse types, and an optional categorical status label. The tool rejects extra keys, including `id` and `data`. Reports include field-name/type frequencies and status frequencies, but never personal field values or document IDs. Added a sanitized example at `docs/examples/legacy-collection-metadata.example.json` and updated tests for rejection of raw values and identifiers. This reduces the chance of accidentally exporting personal content into an audit input. No production data was accessed.


### SEC-LEGACY-COLLECTIONS-04 — auditor syntax and field type integrity — 2026-11-21

A static re-review found a duplicate timestamp constant declaration introduced during the metadata-only refactor. Removed the duplicate block. Added expected coarse field types to each V1 collection schema and a `fieldTypeMismatches` counter. The CLI now returns a review-required exit code when field types differ from the V1 contract. Added regression coverage for mismatched book title and dream progress types. The tests and syntax checks have not yet been executed; no pass is claimed.


### SEC-CI-EMULATOR-03 — root quality gates included in CI — 2026-11-21

The dedicated workflow now runs `npm test` and `npm run check` before installing/running the Firestore Emulator suite. Pull-request path filters now include repository tests, core policies and scripts, in addition to Emulator files. This ensures changes to the legacy inventory tool trigger the checks rather than relying solely on pushes to the feature branch. Execution on the latest head remains unconfirmed.


### SEC-LEGACY-MIGRATION-01 — fail-closed migration manifest contract — 2026-11-21

Added `js/core/legacy-migration-manifest.js`, a pure validator for a versioned manifest. It requires explicit coverage of all five private collections, field-level actions, source/target schema declarations, explicit approval, a backup reference, and verified rollback. Destructive field drops require a separate data-loss approval; renames require a target; defaults require an explicit value; manual-review entries require a documented resolution.

The readiness assessor consumes only the sanitized inventory report. Any inventory gap blocks readiness. Even a clean inventory and structurally approved manifest remain blocked pending independent staging rehearsal and production backup verification. The module does not connect to Firebase, inspect user records, or write data.

Added an offline CLI and an unapproved template. The template intentionally contains no field mappings and cannot pass validation. No legacy mappings are inferred and no migration runner exists.


**Manifest validation refinement:** unknown placeholders such as `legacy-unknown` and `UNCONFIRMED` are rejected as source schema identifiers; a reviewed manifest must identify the actual source schema/version. Status-map targets are checked against the exact V1 status allowlist for the corresponding collection. Regression tests cover both guards.
