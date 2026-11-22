# Firestore access-control matrix — V1.0

Date: 2026-11-22
Baseline: current `main` application services, compared with the integration branch's deny-by-default `firestore.rules`.

## Purpose and safety

This is an implementation review, not a permission grant. The checked-in rules remain deny-all until each row below has a corresponding Rules Emulator test. Firebase Admin SDK Functions bypass Firestore Rules; every callable must therefore enforce its own authentication, ownership and input validation.

## Observed Firestore paths and required policy

| Path | Current client operations observed | V1.0 intended access | Security decision / blocker |
|---|---|---|---|
| `users/{uid}` | Auth/profile reads; profile stats, level and metadata updates; settings edits; username lookup queries | Public profile projection readable only for fields approved by profile privacy; owner may read own private profile; narrowly allowlisted owner updates | Current document mixes public and private data (`email`, privacy, stats, profile fields). Do not allow broad public document reads or unrestricted owner `update`. Split public profile from private account data or expose a safe public projection before enabling public reads. |
| `users/{uid}/travels/{id}` | Owner CRUD; profile/search reads | Owner-only CRUD by default; public reads only if a separate explicit privacy policy is implemented and query behavior is validated | Must validate `request.auth.uid == uid`; public profile privacy cannot be inferred from current rules. |
| `users/{uid}/restaurants/{id}` | Owner CRUD; profile/search reads | Owner-only CRUD by default | Same owner check; validate fields and prevent client changes to server-managed counters. |
| `users/{uid}/movies/{id}` | Owner CRUD; profile/search reads | Owner-only CRUD by default | Same owner check; validate fields and prevent client changes to server-managed counters. |
| `users/{uid}/books/{id}` | Owner CRUD; profile/search reads | Owner-only CRUD by default | Same owner check; validate fields and prevent client changes to server-managed counters. |
| `users/{uid}/dreams/{id}` | Owner CRUD; profile/search reads | Owner-only CRUD by default; sharing must be an explicit separate feature | Same owner check; do not assume dreams are public because the profile has a public privacy default. |
| `users/{uid}/dailyTasks/current` | Owner read/create/update | Owner-only read/write with field/type validation | Client must not award XP/currency or mutate server-calculated rewards without trusted validation. |
| `users/{uid}/notifications/{id}` | Client create, list, mark-read | Owner read and mark-read only; creation restricted to trusted server | Current client-side notification creation is not safe to retain as a general permission. |
| `users/{uid}/chats/{partnerUid}` | Client creates/updates/deletes both participants' chat summaries | No cross-user client writes; trusted server creates and updates both summaries, or redesign to per-user owner-scoped inbox records | Current implementation lets one client write into another user's subtree. Must be redesigned before Rules are opened. |
| `chats/{chatId}/messages/{messageId}` | Client create/read/update/delete; chat ID is derived from sorted UIDs | Only authenticated chat participants may read; sender may create messages as self; edits/deletes constrained; server validates participant membership | Rules must verify membership from trusted chat metadata, not trust senderId/receiverId fields supplied by client. Current code has no canonical participant document. |
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
- [ ] Move notification creation, friend acceptance and bilateral chat mutations behind trusted server operations or redesign them.
- [ ] Add path-specific Rules and Rules Emulator tests in small groups.
- [ ] Reconcile UI/services with the new access contract.
- [ ] Run two-account staging for privacy boundaries and core user flows.
- [ ] Only then propose a reviewed Rules deployment.

## Explicit non-actions

- No Firestore Rules have been broadened.
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
