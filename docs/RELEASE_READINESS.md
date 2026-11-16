# DreamAndGo — release readiness for PR #1

Last review: 2026-11-16. Branch: `refactor/security-foundation` → `main`.

## Current decision

**HOLD — not ready to merge to production.** The repository is already serving real users. This PR changes 191 files (17,111 additions, 5,192 deletions at review), including auth, routing, chat, profile and personal collections. CI passing is necessary but not sufficient.

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
