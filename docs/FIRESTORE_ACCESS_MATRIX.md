# Firestore access-control matrix — V1.0

Date: 2026-11-22
Baseline: current `main` application services, compared with the integration branch's deny-by-default `firestore.rules`.

## Purpose and safety

This is an implementation review, not a permission grant. The checked-in rules remain deny-all until each row below has a corresponding Rules Emulator test. Firebase Admin SDK Functions bypass Firestore Rules; every callable must therefore enforce its own authentication, ownership and input validation.

## Observed Firestore paths and required policy

| Path | Current client operations observed | V1.0 intended access | Security decision / blocker |
|---|---|---|---|
| `users/{uid}` | Legacy app modules still contain direct profile/stat/metadata writes; AuthService profile read and Settings profile read/edit now use owner-only callables | Public projection is separate; owner private reads and allowlisted profile edits through App Check-enforced callables; other owner operations need path-specific Rules or server APIs | Do not open broad client read/write access. Direct legacy writes in signup, stats, levels and other modules remain blockers. |
| `users/{uid}/travels/{id}` | Owner CRUD; profile/search reads | Owner-only CRUD by default; public reads only if a separate explicit privacy policy is implemented and query behavior is validated | Must validate `request.auth.uid == uid`; public profile privacy cannot be inferred from current rules. |
| `users/{uid}/restaurants/{id}` | Owner CRUD; profile/search reads | Owner-only CRUD by default | Same owner check; validate fields and prevent client changes to server-managed counters. |
| `users/{uid}/movies/{id}` | Owner CRUD; profile/search reads | Owner-only CRUD by default | Same owner check; validate fields and prevent client changes to server-managed counters. |
| `users/{uid}/books/{id}` | Owner CRUD; profile/search reads | Owner-only CRUD by default | Same owner check; validate fields and prevent client changes to server-managed counters. |
| `users/{uid}/dreams/{id}` | Owner CRUD; profile/search reads | Owner-only CRUD by default; sharing must be an explicit separate feature | Same owner check; do not assume dreams are public because the profile has a public privacy default. |
| `users/{uid}/dailyTasks/current` | Owner read/create/update | Owner-only read/write with field/type validation | Client must not award XP/currency or mutate server-calculated rewards without trusted validation. |
| `users/{uid}/notifications/{id}` | Legacy client create/list/mark-read | Owner-scoped callable list (allowlisted projection) and mark-read; creation only from trusted, validated domain events | Notification list/read callables are implemented in candidate. Firestore Rules remain deny-all; direct realtime listener and client writes are removed from the notification service. Achievement/level-up creation waits for server-side progression; message creation waits for trusted chat send. |
| `users/{uid}/blockedUsers/{targetUid}` | Block/unblock state for the owner; read and write only through trusted callables | Server-owned block record; no client reads or writes | Chat callables check both directions before chat creation and message send; contact projection omits blocked pairs. |
| `users/{uid}/chats/{chatId}` | Chat V2 browser subscribes to the signed-in owner's inbox; server writes summaries only | Owner may read/list own inbox summaries; all writes are server-only | Candidate Rules permit owner-scoped read/list only. New V2 summaries are created/updated by trusted callables. Legacy partner-ID summaries remain unmigrated. |
| `chats/{chatId}` | Chat V2 browser reads canonical membership only as a participant; trusted callables create metadata | Participants may read canonical membership; no client list or writes | Candidate Rules use server-owned `participants`; create/update/delete remain denied to clients. |
| `chats/{chatId}/messages/{messageId}` | Chat V2 browser subscribes to participant history; trusted callables create and update read receipts | Participants may read/list messages; all client writes are denied | Candidate Rules enforce participant reads. Callable send uses authenticated UID, deterministic client message ID and transaction; message text is excluded from notifications. |
| `users/{uid}/friends/{friendUid}` | Client writes both users' friend records | No cross-user writes; server-mediated acceptance/removal or per-user requests with independently accepted counterpart records | Current bilateral batch writes violate least privilege. |
| `users/{uid}/friendRequests/{fromUid}` | Client creates request under recipient's subtree and removes both sides | Recipient reads/responds; sender creates only a request addressed to the recipient through a validated server endpoint, or redesign so sender writes own outgoing request | Do not allow arbitrary writes into another user's subtree. |
| `users/{uid}/sentRequests/{toUid}` | Client writes both sender and recipient-side request docs | Sender-only own outgoing request; recipient-side state written by trusted server | Keep state transitions atomic and validate participants. |
| `usernameReservations/{normalizedUsername}` | No legitimate direct client operations; server transaction owns records | No client read/write; Admin SDK only | Reservation contents reveal account linkage and must stay private. |
| `system/usernameRegistry` | Server reads readiness flags | No client read/write; Admin SDK only | Migration readiness must never be client-controlled. |

## Cross-cutting rules requirements

1. Default deny remains in place.
2. Every owner-scoped path checks authenticated UID against the path UID.
3. Never use client-supplied `senderId`, `ownerId`, `partnerId`, `role`, `isAdmin`, or similar claims as proof of authorization.
4. Server-managed fields (email identity, username reservation, XP/rewards, notification creation, registry flags, audit timestamps) must not be client-writable.
5. Public profile reads must not expose email, account state, private preferences, or other non-public fields. Prefer separate `publicProfiles/{uid}` and `privateUsers/{uid}` documents over field filtering in Rules.
6. Cross-user operations (friend acceptance, chat membership, bilateral chat summaries) must be mediated by trusted server logic or redesigned as independently owner-scoped records.
7. Validate allowed keys, value types, string lengths, immutable fields and document ownership on create/update.
8. Add positive and negative Rules Emulator tests for anonymous users, owner, unrelated authenticated user, chat participant, non-participant, friend requester and recipient.
9. Test collection queries, not only individual document reads; Firestore Rules are not filters.
10. Do not publish broader rules until the app has been refactored to conform to the access model.

## Required implementation order

- [x] Inventory major Firestore paths in Auth, profile, books, chats, tasks, dreams, friends, level, movies, notifications, restaurants, search, travels and settings services.
- [x] Record current deny-all posture and unsafe cross-user operations.
- [x] Separate public profile projection from private account data in the profile reader: owners read `users/{uid}`; visitors read only `publicProfiles/{uid}`. Public Rules remain deny-all until tested.
- [x] Move friend acceptance and bilateral chat mutations behind trusted server operations. Chat V2 message and notification writes are also server-only.
- [x] Add candidate path-specific Rules for public profile reads, owner inbox reads and participant-only chat/message reads; Rules Emulator matrix added, execution pending.
- [x] Chat V2 browser uses callables for contact discovery/create/send/history/read state and read-only Firestore listeners for owner inbox and participant messages.
- [ ] Run two-account staging for privacy boundaries and core user flows.
- [ ] Only then propose a reviewed Rules deployment.

## Execution batches — required before any Rules expansion

The current deny-all Rules are intentional. Do not replace them with broad owner access: several legacy services still perform cross-user writes or mutate server-owned values.

### Batch 1 — identity and profile boundary
- [x] AuthService private profile reads use `getMyProfileV1`.
- [x] Settings profile edits use `updateMyProfileV1`.
- [x] Public profile data is shaped by a server-side allowlist.
- [ ] Wire and verify App Check + callable transport in staging.
- [ ] Verify public profile reads only from `publicProfiles/{uid}`; never expose `users/{uid}` to unrelated users.

### Batch 2 — friends and notifications
- [x] Move friend-request creation, acceptance, rejection, cancellation and removal behind authenticated server operations.
- [x] Every friend mutation derives the actor UID from callable auth context; client-supplied actor IDs are not accepted.
- [x] Cross-user friendship state changes and reciprocal records are written only inside trusted server transactions.
- [ ] Move all notification creation to trusted server operations. Friend-request and friend-accepted notifications are created inside trusted transactions. Achievement/level-up events wait for trusted progression logic; message events wait for trusted chat send.
- [x] Friend-event notification text/type/target are fixed server templates and use server-read profile labels; other event types remain pending.
- [x] Duplicate friend requests are rejected transactionally; repeated transitions fail when the pending request no longer exists.
- [ ] Emulator matrix: anonymous, requester, recipient, unrelated user; verify no caller can mutate another user's friend or notification records. Callable unit tests exist for friend and notification ownership; Emulator coverage remains pending.

### Batch 3 — chat
- [x] Candidate: establish canonical server-owned private-chat membership metadata before allowing message access; exact-HEAD Emulator verification remains pending.
- [x] Candidate: add App Check-enforced callables for create/send/history/read receipts/unread/status, backed by canonical membership metadata.
- [x] Candidate: sender and recipient are derived from Auth UID and verified chat membership; extra identity fields are rejected.
- [x] Candidate: new-message notifications contain sender label only; message body is not copied into notification payloads or server logs.
- [x] Added Rules Emulator cases for participant A/B, unrelated C, anonymous, owner inbox reads and denied client writes; execution pending.
- [x] Added callable Emulator cases for canonical membership, inbox projection, idempotent send retries, history pagination and read receipts; execution pending.
- [x] Block/unblock enforcement and UI; both directions are checked by trusted callables and blocked pairs are removed from new-chat contacts.
- [x] AES-GCM-256 encrypted IndexedDB outbox and stable-ID reconnect retry implemented in candidate.
- [ ] Browser persistence/reconnect acceptance; preserve old conversations through an idempotent migration rehearsal; do not enable chat rollout before two-account staging.

### Batch 4 — progression, tasks and user collections
- [ ] Move XP, level, achievement and reward calculation to trusted server logic; the browser must not award or increment currency/XP directly.
- [ ] Make daily task completion and reward claims atomic and idempotent; prevent replay and concurrent double claims.
- [ ] For travels, restaurants, movies, books and dreams, implement owner-scoped CRUD with allowlisted fields and bounded input.
- [ ] Validate immutable/server-managed fields on create and update.
- [ ] Emulator matrix: owner CRUD succeeds; another authenticated user and anonymous user are denied; forged owner IDs and reward fields are rejected.

### Batch 5 — Rules rollout gate
- [ ] Every path in this matrix has an explicit rule or remains server-only.
- [ ] Every rule has positive and negative Emulator tests, including query behavior.
- [ ] All corresponding browser services use the approved callable or owner-scoped contract; no legacy direct writes remain for that path.
- [ ] Full application regression and two-account staging pass on the exact candidate commit.
- [ ] Only after review may a separate production Rules change be proposed.

**Hard stop:** do not enable any broad `users/{uid}/**` read/write rule. It would grant access to nested friends, requests, notifications, chat summaries and progression records that have different trust requirements.

## Explicit non-actions

- Candidate branch Rules now allow only public-profile projection reads, owner-scoped inbox reads and participant-only chat/message reads; all chat client writes remain denied.
- No production Rules publication or data migration.
- No public profile or chat visibility assumptions have been enabled.
- No client writes to username reservations or registry are permitted.

## Public profile document contract (candidate; not deployed)

`publicProfiles/{uid}` is a server-generated projection and must exist only when the owner explicitly sets `privacy.profile` to `public`. Missing, legacy, unknown or `private` values mean no public document; category-level legacy defaults do not establish profile-level consent. When enabled, the projection may contain only:

- `uid`, normalized `username`, bounded `displayName`, `bio`, `location`.
- `avatar` and `website` only as HTTPS URLs without embedded credentials.
- `createdAt` when it is a recognized Firestore Timestamp or ISO date.
- `stats` containing only `travels`, `restaurants`, `movies`, `books`, `dreams` whose corresponding category privacy flag is explicitly `public`. `restaurants` maps to legacy `privacy.food`. Missing/unknown flags hide the statistic. `friends` count is omitted until a dedicated visibility preference exists.

It must never contain email, last login, `usernameNormalized`, friends list, achievements, account preferences, or the privacy preference map itself. `server/public-profile.js` implements only this deterministic projection and is covered by `server/public-profile.test.js`; it does not perform authorization, persistence, synchronization, migration, or Rules enforcement. It is not wired into the running application and no public profile documents are currently created by this change. The projection returns `null` unless the separate `privacy.profile === 'public'` opt-in is present.


### Consent hardening — 2026-11-22

The public projection now has a separate profile-level consent gate. This is deliberately distinct from legacy category preferences: historical signup defaults marked several categories as public, but those defaults are not treated as consent to publish a public profile. Missing, unknown and private profile-level visibility produce no projection. Category statistics remain independently filtered.


### Profile visibility callable — candidate implementation

- `updateProfileVisibilityV1` is an App Check-enforced callable in `europe-west3`.
- The authenticated UID is taken only from callable auth context; the client cannot select another UID or send arbitrary profile fields.
- The callable requires the complete allowlisted visibility map: `profile`, `travels`, `food`, `movies`, `books`, `dreams`, each exactly `public` or `private`.
- It atomically replaces the legacy privacy map and creates/updates or deletes `publicProfiles/{uid}` using the allowlist projection. Legacy public defaults are overwritten only after the owner submits the complete new settings.
- Unit tests cover auth, malformed paths, unknown/missing keys, public projection, private deletion, missing profile and generic storage errors.
- The callable is not yet wired to the browser UI; App Check provider configuration, Emulator callable tests, Rules for public profile reads, consent UX and staging remain NOT DONE. Do not deploy.


### Client privacy settings wiring — candidate only

The Settings module now exposes explicit profile-level and category-level visibility selectors and invokes the owner-authorized callable through a small client service. The browser initializes Firebase App Check only when a valid reCAPTCHA v3 site key is supplied in `index.html` meta `firebase-app-check-site-key`. The checked-in value is intentionally empty; the privacy save control stays disabled. No Rules have been opened. The existing general profile-edit form still performs legacy direct writes and must be migrated before owner write permissions are introduced.


### Owner profile callable boundary — 2026-11-22

The integration branch now routes the Settings profile editor and AuthService private-profile load through `getMyProfileV1` and `updateMyProfileV1`. Both require Auth and App Check. The update callable accepts only username, displayName, bio and location; username changes require a ready registry and atomically move reservations. If profile visibility is public, the allowlisted public projection is refreshed in the same transaction. This does not authorize any direct client access to `users/{uid}`; Rules remain deny-all and the legacy signup/statistics/level flows still need migration.


### Notification callable boundary — candidate only

- `getMyNotificationsV1` derives the account from Auth, reads only that account's notification subcollection and returns an allowlisted projection (no arbitrary payload fields).
- `markNotificationReadV1` accepts only a notification ID and updates only the authenticated owner's document.
- `markAllNotificationsReadV1` updates the owner's unread records in bounded batches; client-selected UIDs and arbitrary update fields are rejected.
- The browser service no longer creates notification documents or directly reads/writes Firestore. It loads the latest 30 notifications through the callable and refreshes every 30 seconds while the widget is active.
- The existing friend callables remain the only newly migrated notification producers. Achievement/level-up creation is intentionally deferred until progression awards are server-authoritative; message notifications are deferred until the chat send path is server-authoritative.
- Unit tests cover App Check options, auth, owner isolation, allowlist projection, input validation and read-state changes. Emulator and two-account staging remain NOT DONE.


### Chat V2 private conversation callables — candidate only

V1.0 scope is one-to-one private conversations. Group chats remain post-v1.0 and are not part of this migration batch.

- `createPrivateChatV2` requires reciprocal friendship, derives a stable SHA-256 chat ID from the two UIDs and creates canonical `chats/{chatId}` membership metadata plus two owner-scoped inbox summaries atomically.
- `sendPrivateMessageV2` accepts only `chatId` and bounded text; sender and recipient are derived from callable Auth and the canonical participant list. Message, summaries, unread counter and a content-free notification are committed in one transaction.
- `getPrivateChatHistoryV2` returns the latest 50 messages only to a participant and exposes an allowlisted projection.
- `getPrivateMessageStatusV2`, `markPrivateMessageReadV2`, `markPrivateMessagesReadV2` and `getPrivateChatUnreadV2` are participant-authorized read-receipt/unread operations; batch receipts update up to 50 messages in one transaction.
- Existing legacy chat documents are not rewritten or deleted. The legacy browser ChatService/RealtimeService is not yet migrated; no feature gate is enabled.
- Unit tests cover reciprocal-friend creation, deterministic IDs, membership enforcement, payload validation, bounded history projection, message privacy, read receipts and unread isolation. Exact-HEAD CI, Emulator matrix, client integration and legacy migration rehearsal remain NOT DONE.


### Chat V2 browser and Rules candidate — 2026-11-23

- Browser `ChatV2Service` is guarded by both `firebase-functions-backend-ready` and `chat-v2-enabled`; both checked-in meta flags remain false.
- Chat create, contact discovery, inbox projection, message send, history pages and read-state operations use App Check-enforced callables.
- Chat list and message updates use read-only Firestore listeners. Candidate Rules allow only owner inbox reads and participant reads; client writes to chat metadata, messages and inbox summaries are denied.
- Message sends use a client-generated stable message ID. The server stores that ID as the message document ID and returns the existing result on a same-content retry without duplicating notifications or unread counts.
- History callable returns 50-message pages with a document cursor; the chat screen loads older pages when scrolled to the top. Read receipts for a visible page are batched into one transaction.
- Account changes stop realtime listeners and clear cached chat IDs, contacts and pending retry IDs.
- Added callable unit tests, callable Emulator scenarios and a Firestore Rules Emulator matrix. All are added but execution on exact HEAD is still pending.
- Remaining blockers: exact-HEAD Unit/Emulator execution, browser IndexedDB and two-account offline/reconnect acceptance, legacy chat migration rehearsal, real App Check/staging transport. Do not enable the feature gate.


### Block enforcement — 2026-11-23

- Added `blockUserV1`, `unblockUserV1` and participant-scoped `getChatBlockStatusV2` callables.
- A block in either direction prevents new private chat creation and message sends. Existing message history remains available to the participants.
- Blocked pairs are removed from the new-chat contact projection.
- Chat V2 header includes block/unblock control; composer is disabled whenever either participant has blocked the other or block status cannot be verified.
- Block records remain server-only under the deny-by-default catch-all Rules.
- Unit and Firestore Emulator regression cases added. Exact-HEAD execution remains pending.


### Encrypted offline outbox — 2026-11-23

- Message bodies are persisted only after AES-GCM-256 encryption; the key is a non-extractable CryptoKey stored in IndexedDB and scoped to the signed-in Firebase UID.
- Additional authenticated data binds each ciphertext to the account UID, canonical chat ID and stable client message ID.
- The local queue is not end-to-end encryption and does not replace server-side authorization or Firestore Rules.
- On reconnect, queued messages are sent sequentially using the original client message ID. Successful sends are removed; permission-denied messages remain encrypted and are marked blocked.
- Account switching stops the previous account's active flush. Encrypted records remain local for that account and are not included in another account's queue projection.
- Browser-level IndexedDB durability, multi-tab behavior and two-account staging still require explicit acceptance.

## Client Firestore call-site audit — 2026-11-23 (source inspection)

This pass inspected the integration-branch browser service implementations, not just the access matrix. It confirms several existing UI paths still depend on direct client Firestore access. The candidate deny-all catch-all Rules intentionally block these paths; do not loosen Rules to make them work.

### P0 — progression and rewards are still client-authoritative

- `js/services/daily-tasks.service.js` directly reads, creates and updates `users/{uid}/dailyTasks/current`.
- Task progress is calculated in the browser from a caller-supplied action. A client can forge progress if this path is ever opened to writes.
- `claimTaskReward` marks a task claimed in one client write and then calls the client-side `LevelService.addXP` in a separate operation. This is not atomic; failures can consume a claim without granting XP, and concurrent claims require server-side idempotency.
- `claimBonusReward` sets `bonusClaimed` in the browser and returns 150 without any server-side reward transaction.
- `js/services/level.service.js` directly increments `users/{uid}.stats.xp`; its client-supplied `action` selects the XP amount. It then reads the profile again and calculates the level in the browser.
- `js/services/achievements.service.js` reads `users/{uid}` and writes the `achievements` array from client-calculated stats. Achievement awards and level-up notifications therefore are not yet server-authoritative.
- No progression/daily-task callable module is currently exported from `server/index.js`.

**Required design:** server-owned progression state; trusted domain mutations emit progress from validated server-side operations; reward claims use an idempotent transaction with server-calculated XP/bonus and immutable claim IDs. Do not add a generic callable that trusts a client-provided `action`, `progress`, `xp`, `level`, `completed` or `claimed` value.

### P0 — friends UI reads bypass the new callable boundary

- [x] Added `getMyFriendsV1`, `getMyFriendRequestsV1` and `getMySentFriendRequestsV1` owner-scoped App Check-enforced callables. They derive UID only from Auth, cap each list at 100 records and return an allowlisted public-profile projection.
- [x] Migrated `FriendsService` friends/incoming/outgoing list reads to those callables; removed its unused direct `publicProfiles/{uid}` document read. Username search remains a bounded public-profile query.
- [x] Added callable unit tests for App Check configuration, owner identity, anonymous rejection, extra-payload rejection and private-field exclusion; registered the suite in root `npm test`.
- [ ] Run the new unit suite and full exact-HEAD CI; static source changes are not execution evidence.
- [ ] Add Emulator coverage and test with two real accounts. Lists currently return at most 100 records; pagination is outside this V1.0 batch.

### P1 — owner collections and aggregate stats remain direct-client paths

- The inspected Book and Travel services perform direct owner collection CRUD and update `users/{uid}.stats.*` from the browser.
- Restaurant service does the same; Movies and Dreams follow the same legacy client-service pattern recorded in this matrix.
- Owner path scoping alone is insufficient: arbitrary spread payloads and direct aggregate-stat writes can alter server-managed fields.
- These paths need explicit per-collection allowlists and bounded payload validation, or server callables. Aggregate counters must be derived/reconciled server-side, never accepted from a client write.

### Rules and rollout decision

- Keep `firestore.rules` deny-by-default for all unapproved paths.
- Do not add broad `users/{uid}/**` owner read/write rules.
- Do not deploy the candidate Rules, Functions or client code to the configured Firebase project; the browser config currently names `dream-and-go`, while the CI Emulator uses `demo-dream-and-go`.
- No live Firestore access, data migration, Rules deployment or production write was performed during this source audit.

### Ordered implementation batches

1. Add read-only owner-scoped Friends list/request callables and migrate the FriendsService reads; test owner A/B, anonymous and unrelated caller.
2. Design progression + daily-task server state and trusted event sources; implement atomic/idempotent reward claims and server-side achievement awards.
3. Migrate Books/Travels/Restaurants/Movies/Dreams CRUD to validated owner-scoped contracts; derive aggregate stats on the server.
4. Only then add narrowly scoped Rules for any browser reads that remain necessary, with positive/negative query Emulator tests.
5. Run exact-HEAD CI and staging with two independent accounts before any rollout.


### Friends list callable migration — 2026-11-23

- Friend list, incoming request and outgoing request reads now use three Auth-derived, App Check-enforced callable endpoints.
- Each endpoint accepts an empty payload only, reads at most 100 relationship records for the authenticated UID, and returns a bounded allowlist of public profile fields plus ISO timestamps.
- The browser FriendsService maps those ISO timestamps back to Date objects for existing UI consumers.
- Removed unused direct document reads from FriendsService; username search remains a query against the publicProfiles collection and uses a narrow stats projection.
- Added `server/friends-read-callables.test.js` and included it in the root explicit test command.
- No Firestore Rules were opened. No callable deployment or production Firebase access occurred.
- Pending: run unit suite/full CI, add callable Emulator coverage, and perform two-account staging acceptance. Pagination beyond 100 relationships is deferred.


### Friends callable Emulator coverage — 2026-11-23

- Added `server/friends-read-callables.emulator.test.js`, discovered by the existing serial `*emulator.test.js` test command.
- Seeds isolated owner/related accounts and checks friends, incoming requests and sent requests; verifies an unrelated account sees only its own empty list.
- Verifies anonymous access and client-supplied UID are rejected, and email/private stats never enter the public projection.
- Bounded list reads use a 101-record lookahead to return at most 100 rows with an accurate `truncated` indicator.
- Test execution remains pending because no exact-HEAD Emulator run has been observed.


### Friends UI realtime-reader retirement — 2026-11-23

- [x] Replaced FriendsModule's three Firestore realtime subscriptions with authenticated FriendsService callable reads.
- [x] Removed the now-unused `subscribeToFriends`, `subscribeToFriendRequests` and `subscribeToSentRequests` direct Firestore listeners from RealtimeService. Chat profile lookup remains because it is used by chat UI and reads only the public profile projection.
- [x] Added request sequencing so stale tab responses cannot overwrite the currently selected list.
- [x] Fixed relationship-action refresh behavior: accepting a request refreshes the active incoming-request tab rather than launching three competing asynchronous list loads.
- [ ] Browser-level UI verification and exact-HEAD CI remain pending. Friend lists now refresh on tab entry and after the relevant action; they are not realtime-pushed. This is intentional for the callable-only V1.0 access boundary.
