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
