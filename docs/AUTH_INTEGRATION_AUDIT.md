# Auth integration audit — V1.0

Date: 2026-11-22
Baseline reviewed: main at f02171c362d5944143a1202f425cd96f2386348f
Scope: js/services/auth.service.js, js/modules/auth/auth.js, js/app.js, Firebase config and the current signup V2 server contract.

## Executive result

The server registration foundation is implemented and passes Auth + Firestore Emulator tests, but the production browser application still uses the legacy client-side registration flow. The V2 server endpoints are not wired into the main app, the App Check web provider/site key is not configured, and no Functions deployment exists. Therefore signup V2 must remain disabled.

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
4. Keep signup V2 behind a server-enforced and client-visible disabled-by-default gate.
5. Add an Auth UI recovery state: incomplete profile → sign in → call recovery endpoint → either complete, resume signup, or show temporary unavailability.
6. Reconcile AuthService so the V2 path never queries the global users collection or writes profile documents from the browser.
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