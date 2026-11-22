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
- [ ] Separate public profile projection from private account data.
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