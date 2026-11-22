# Auth integration audit — V1.0

Date: 2026-11-22
Baseline reviewed: main at f02171c362d5944143a1202f425cd96f2386348f
Scope: js/services/auth.service.js, js/modules/auth/auth.js, js/app.js, Firebase config and the current signup V2 server contract.

## Executive result

The server registration foundation and browser integration are implemented on the isolated integration branch. The browser uses the V2 callable adapter and recovery UI, while all rollout flags remain false. The real App Check site key, HTTPS callable transport verification, legacy registry backfill and staging acceptance are still missing. Signup V2 therefore remains disabled.

## Findings in the current main AuthService

| Priority | Finding | Why it matters |
|---|---|---|
| P0 | checkUsernameUnique() queries users from the browser before signup | Client-side availability checks are race-prone and cannot reserve a nickname atomically. Under deny-all Rules, the query fails and registration stops. |
| P0 | signUpWithEmail() creates the Auth account, then writes the profile directly with setDoc | This bypasses the intended server-owned profile contract and fails under deny-all Rules. |
| P0 | On profile write error, the browser deletes the newly created Auth account | A timeout can occur after Firestore committed. Deleting Auth in that uncertain state can leave an orphan profile/reservation. V2 helper already has a safer non-destructive uncertain-outcome policy. |
| P1 | createUserCollections() writes seven _init placeholder documents | Firestore subcollections do not need placeholder documents. These writes add cost and failure points and are incompatible with deny-all Rules. |
| P1 | signInWithEmail() calls updateLastLogin() which writes Firestore from the client | Login itself may succeed while the write is denied; the error is swallowed. Move this to a trusted, bounded server operation only if V1.0 needs it. |
| P0 | getUserData() reads the profile directly from Firestore | The application cannot complete authenticated bootstrap with deny-all Rules. A deliberate owner-scoped read policy or server profile endpoint is required before staging. |
| P1 | Auth UI only surfaces a generic error and has no recovery-state flow | A user whose Auth account exists but profile is incomplete needs a recovery path, not a second registration attempt. |

## Existing V2 building blocks

- [x] Server callable derives UID from request.auth.uid.
- [x] Server loads the account email/disabled status from Firebase Admin Auth.
- [x] Profile and canonical username reservation are created in one Firestore transaction.
- [x] Retry is idempotent only for the exact matching profile/reservation pair.
- [x] Recovery callable returns an allowlisted status for the current UID only.
- [x] App Check is required by both callable endpoint options.
- [x] Auth + Firestore Admin SDK integration tests and deny-all Rules tests pass in emulators.
- [x] Added an isolated dependency-injected browser callable adapter in the integration branch; it is not wired into main.
- [ ] Browser App Check provider/site key is not configured.
- [ ] HTTPS callable transport and App Check token exchange are not tested end-to-end. The adapter is currently tested with injected callable handles.
- [ ] Functions are not deployed to staging or production.
- [ ] Legacy users have not been backfilled into the username registry.

## Safe integration sequence

1. Keep the current main login path and legacy user data untouched.
2. [x] Add a dependency-injected client adapter for the two V2 callables, with no default enablement. Adapter unit tests are included; it is not wired into the main app.
3. Wire Firebase Functions and App Check only after the real site key/provider and Functions region are confirmed.
4. [x] Keep signup V2 behind a server-enforced and client-visible disabled-by-default gate.
5. [x] Add an Auth UI recovery state: incomplete profile → sign in → call recovery endpoint → either complete, resume signup, or show temporary unavailability.
6. [x] Reconcile AuthService so the V2 path never queries the global users collection or writes profile documents from the browser.
7. Preserve the old login path until owner-scoped profile reads and legacy account compatibility are tested.
8. Define the Firestore access matrix for profile self-read/update and each user-owned collection before changing deny-all Rules.
9. Run two-account browser staging, including registration, logout/login, recovery after simulated timeout, and cross-account access denial.
10. Only after staging sign-off: deploy Functions, apply reviewed Rules and execute a dry-run/backed-up username registry migration.

## Explicit non-actions

- No changes to main.
- No production Firebase Rules change.
- No Functions deployment.
- No App Check enforcement/provider changes in Firebase Console.
- No Auth account deletion, profile write, username reservation or user migration in the live project.
- No enabling of signup V2.

## Integration branch update — 2026-11-22

The browser-side signup V2 wiring is now present on `integration/v1.0-reconciliation`:

- `SignupV2Service` creates only the two allowlisted callable handles in `europe-west3` and requires App Check for transport readiness.
- `AuthService` uses the V2 orchestration flow; no direct Firestore username query, profile creation, placeholder writes or client `lastLogin` write remain.
- Auth bootstrap checks the signed-in UID's registration state and routes missing profiles to the recovery form.
- Signup and recovery reconcile ambiguous callable outcomes with server state before deciding success or cleanup. Unknown outcomes preserve the Auth account.
- The registration UI remains disabled because the site key and all three rollout signals are intentionally unset/false.
- No Firebase deployment, Rules publication, production migration or live account operation was performed.
