# Dream&Go — дорожная карта V1.0

Источник требований: [PRODUCT_SPEC.md](PRODUCT_SPEC.md) и [DELIVERY_PLAN.md](DELIVERY_PLAN.md). Новые продуктовые функции вне согласованного объёма V1.0 не добавлять.

## Статус интеграции

- [x] Создана отдельная ветка `integration/v1.0-reconciliation` от актуального `main` (`f02171c362d5944143a1202f425cd96f2386348f`).
- [x] Проведено сравнение с `refactor/security-foundation`; общий предок — `ffc60beca6d1f7840c52483019e4d8e0117de08c`.
- [x] Подтверждено расхождение: main +53 коммита, candidate +1 625 коммитов; 22 изменённых пути в main и 300 в candidate, 20 путей пересекаются.
- [x] Создан [план безопасной интеграции](INTEGRATION_PLAN.md).
- [ ] Не переносить candidate код до ручной сверки конфликтующих файлов и проверки тестовой инфраструктуры.
- [ ] Не сливать PR #1 целиком; его GitHub-состояние на момент аудита — `dirty`.

## V1.0 — обязательные релизные ворота

### Качество приложения
- [ ] Root unit tests проходят на точном integration HEAD.
- [ ] Синтаксическая проверка проходит на точном integration HEAD (checker added; execution evidence pending).
- [ ] Emulator suites проходят на точном integration HEAD.
- [ ] CI не зависает; для каждого набора есть сохранённый итоговый job result и логи.

### Аккаунт, приватность и безопасность
- [ ] Регистрация, вход, выход и восстановление проверены двумя независимыми аккаунтами.
- [ ] Профиль и публичная проекция соблюдают приватность по умолчанию.
- [ ] Все MUST-сценарии коллекций работают с реальными данными в staging.
- [ ] Guest / owner A / owner B / unrelated C проверки Firestore Rules пройдены.
- [ ] App Check и серверные callable проверены в staging.
- [ ] Username registry backfill имеет dry-run, collision report, backup и rollback.

### Chat V2
- [ ] Серверная авторизация участников, сообщения, история, unread/read receipts и блокировки проверены Emulator-тестами.
- [ ] Клиентская интеграция совместима с текущим main security baseline.
- [ ] Старые переписки сохранены; миграция идемпотентна и прошла rehearsal.
- [ ] Два аккаунта прошли staging-проверку; feature gate остаётся выключенным до приёмки.

### Релиз и данные
- [ ] Все MUST-функции PRODUCT_SPEC подключены к UI и прошли staging-приёмку.
- [ ] Backup/restore и rollback rehearsal подтверждены для миграций.
- [ ] Production Rules и Functions сверены с кандидатной конфигурацией.
- [ ] Production rollout выполняется только после отдельного явного подтверждения владельца.

## Безопасные ограничения

- `main` не изменяется в рамках этой интеграционной ветки.
- Production Firebase Rules, Functions и пользовательские данные не изменяются.
- Не выполнять миграции и не включать rollout gates до staging-приёмки.
- Любая задача считается DONE только при наличии проверяемого результата на актуальном HEAD.


### Test harness batch — 2026-11-22

- [x] Added dependency-free root test runner and syntax checker.
- [x] Added six regression tests for current main security helpers.
- [x] Added bounded CI workflow for the integration branch.
- [ ] Await actual GitHub Actions execution; empty run list/status is not a pass.


### Username and signup foundation — 2026-11-22

- [x] Canonical username normalization and validation helpers added.
- [x] Signup V2 rollout policy defaults closed unless all three readiness signals are true.
- [x] Signup orchestration protects uncertain callable outcomes from destructive Auth-account rollback.
- [x] Added 13 focused tests for username, rollout policy and signup rollback paths.
- [ ] CI/test execution still needs confirmation on the current integration HEAD.
- [ ] Firebase registry transaction, App Check, callable bridge and Emulator tests remain NOT DONE.


### Username registry transaction core — 2026-11-22

- [x] Added server-only transactional username reservation helper.
- [x] Added fail-closed legacy registry readiness gate.
- [x] Added safe idempotent recovery for an already-committed matching profile/reservation pair.
- [x] Added 7 transaction-mock tests for reservation, conflicts, migration gate and retries.
- [ ] Firebase callable, App Check and Firestore Emulator integration remain NOT DONE.
- [ ] Test execution on the exact integration HEAD remains unverified.


### CI and Firebase client helper batch — 2026-11-22

- [x] Root CI on `4eb0f6537b64e73de69e07c2e7627b05b60da95a`: 26/26 unit tests passed; syntax check passed for 47 JS files.
- [x] App Check bootstrap helper and tests added (SDK wiring pending).
- [x] Chat V2 callable invoker allowlist and tests added (server-side authz still required).
- [ ] Re-run CI on the new HEAD; do not carry forward the previous success.
- [ ] Verify App Check key / Functions region / deployed endpoints before Firebase config wiring.
- [ ] Firestore Emulator integration and two-account staging remain NOT DONE.


### Server-side registration callables — 2026-11-22

- [x] Isolated Functions entrypoint exposes signup V2 endpoints only.
- [x] App Check is enforced at callable boundary; authenticated UID and email are taken from verified Firebase Auth context/Admin Auth.
- [x] Username registry transaction is used for profile creation; rollout remains off until registry readiness gate is verified.
- [x] Recovery endpoint exposes only an allowlisted registration state for the caller's own account.
- [x] Added callable and recovery-state unit tests.
- [ ] CI on exact current HEAD pending.
- [ ] Emulator tests and staging verification with two accounts remain NOT DONE.
- [ ] Functions deploy and production data migration remain explicitly prohibited until release gates are passed.


### CI verification — registration batch — 2026-11-22

- [x] Server registration and recovery unit suite included in green CI: 46/46 passed.
- [x] Syntax check passed for 51 JavaScript files.
- [x] Previous failing edge case was fixed and covered by the passing exact-head run.
- [ ] Firebase Emulator and staging acceptance remain NOT DONE.


### Firestore Emulator integration — 2026-11-22

- [x] Added isolated Firestore Emulator configuration using demo project ID in CI.
- [x] Added deny-by-default Firestore Rules file; client access remains closed pending audited path-specific policies.
- [x] Added Admin SDK transaction integration tests for atomic signup, retry recovery, concurrent username collision, and migration gate behavior.
- [x] CI now installs server dependencies and runs the Firestore Emulator integration suite.
- [x] Emulator test suite is isolated from dependency-free unit discovery; Admin SDK uses the emulator host environment.
- [ ] Verify exact-head CI success.
- [ ] Client Rules tests and Auth Emulator/callable end-to-end coverage remain NOT DONE.
- [ ] No production deploy or migration performed.


### Auth Emulator and Firestore Rules tests — 2026-11-22

- [x] Added Auth Emulator to local/CI emulator configuration.
- [x] Added Auth+Firestore integration tests for trusted email, duplicate username race and signup recovery using real Admin SDK clients.
- [x] Added Rules Unit Testing coverage for anonymous, owner and unrelated user under current deny-all policy.
- [x] CI now starts Auth and Firestore emulators together and runs serialized integration suites.
- [ ] Exact-head CI success pending.
- [ ] HTTPS callable transport and App Check token exchange end-to-end remain NOT DONE.
- [ ] No production rules/deployment/migration changes.


### Auth + Firestore Emulator CI verified — 2026-11-22

- [x] Exact-head GitHub Actions run [44994432130](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44994432130): success.
- [x] Root unit suite: 46/46 passed.
- [x] Auth + Firestore Emulator integration suite: 10/10 passed, including auth identity/token, duplicate-username race, recovery, and Rules access matrix.
- [x] Firestore transaction integration suite: atomic signup, retry recovery, concurrency conflict and migration gate all passed.
- [x] Syntax check: 51 JS files passed.
- [ ] HTTPS callable transport, App Check exchange and two-real-account staging remain NOT DONE.
- [ ] Production deploy, rules publication and data migration remain NOT DONE.


### Legacy AuthService audit — 2026-11-22

- [x] Audited current main signup/login/profile flow against V2 server contract.
- [x] Documented race-prone client nickname checks, direct profile writes, unsafe rollback on uncertain network outcome, unnecessary placeholder docs, client lastLogin writes and direct profile reads under deny-all Rules.
- [x] Added docs/AUTH_INTEGRATION_AUDIT.md with safe integration sequence and explicit non-actions.
- [ ] Browser callable adapter, App Check site key/provider wiring and HTTPS callable tests remain NOT DONE.
- [ ] Owner-scoped profile/collection Rules and browser staging remain NOT DONE.
- [ ] Signup V2 stays disabled; no production changes.


### Signup V2 browser adapter — 2026-11-22

- [x] Added dependency-injected client adapter for the two registration callables.
- [x] Added response validation, nickname validation, allowlisted recovery states and safe transport error propagation.
- [x] Added eight unit tests; no Firebase config, AuthService, App Check or rollout was changed.
- [ ] Latest exact-head CI verification pending.
- [ ] Main app wiring and staging remain NOT DONE.


### Signup V2 adapter test correction — 2026-11-22

- [x] Fixed test import path after CI caught an incorrect relative module path.
- [ ] Exact-head CI on corrected commit pending.


### Firestore access-control inventory — 2026-11-22

- [x] Audited major Firestore paths and client read/write patterns.
- [x] Documented high-risk cross-user writes and mixed public/private profile document.
- [x] Added `docs/FIRESTORE_ACCESS_MATRIX.md` as the source of truth for the V1.0 Rules migration.
- [ ] Public/private profile split and server-mediated chat/friend/notification operations remain NOT DONE.
- [ ] Path-specific Rules and positive/negative Rules Emulator tests remain NOT DONE.
- [ ] Rules stay deny-all; no production change.


### Public profile projection — 2026-11-22

- [x] Added isolated server-side allowlist projection for public profile data.
- [x] Added privacy-aware statistic filtering and fail-closed defaults.
- [x] Added tests for private-field exclusion, privacy filtering, URL validation, bounded text, UID validation and timestamp handling.
- [ ] Server write/sync callable, private profile split, consent UI, migration/backfill and Rules remain NOT DONE.
- [ ] No production data or Rules changed.


### Repository housekeeping and developer experience — 2026-11-22

- [x] Reworked root README with product overview, scope/status, repository map, local launch, test commands and security caveats.
- [x] Added documentation index at `docs/README.md`.
- [x] Added contribution guide, security policy, pull request checklist and structured bug report template.
- [x] Added `.gitignore`, `.editorconfig` and `.gitattributes` for predictable local development and clean commits.
- [x] Audited JavaScript / MJS application, service, server, test and tooling files for explicit DeepSeek / Deep Seek / ChatGPT / AI-generated attribution markers; no matches found, so no code comments were removed.
- [x] Reviewed tracked file inventory (81 files before housekeeping); no safe-to-delete duplicate or generated artifact was identified. No source files were deleted.
- [ ] Validate the final housekeeping HEAD with CI.
- [ ] Full runtime browser smoke test and responsive/accessibility review remain NOT DONE.
- **Safety:** no production configuration, Firestore Rules, user records or application runtime logic changed in this housekeeping batch.


### Public profile consent hardening — 2026-11-22

- [x] Added a separate explicit `privacy.profile === 'public'` gate to the projection.
- [x] Legacy category-level `public` defaults no longer imply consent to publish a profile.
- [x] Missing, unknown and private profile visibility fail closed by returning no public projection.
- [x] Added regression tests for absent, private, unknown and explicit profile consent, plus independent category visibility.
- [ ] Consent UI, trusted callable synchronization, Firestore Rules and migration/backfill remain NOT DONE.
- [ ] No public documents are written; no production data or Rules changed.


### Profile visibility callable foundation — 2026-11-22

- [x] Added App Check-enforced `updateProfileVisibilityV1` callable in the existing Functions region.
- [x] Server derives UID only from verified callable auth context; no client-selected UID or arbitrary profile field writes.
- [x] Requires a complete allowlisted visibility map and validates every value.
- [x] Uses one Firestore batch to replace privacy preferences and create/update or delete the public projection atomically.
- [x] Added focused unit tests for auth, validation, projection, deletion and failure handling; included them in root CI test script.
- [ ] Browser consent UI and callable adapter remain NOT DONE.
- [ ] Authenticated callable Emulator tests, public profile read Rules and two-account staging remain NOT DONE.
- [ ] No deployment, migration or production Rules changes.


### Profile visibility foundation — CI verified

- [x] Exact-head GitHub Actions run [44996877016](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44996877016) on commit `9b8626587aedd27d71e8bea36bb02d392af3275f`: success.
- [x] Root unit tests: 73/73 passed.
- [x] Auth + Firestore Emulator suite: 10/10 passed.
- [x] JavaScript syntax check: all 53 files passed.
- [x] Added a revocation safeguard: choosing private always deletes the public projection even when legacy public fields are invalid.
- [ ] CI must be rerun after subsequent commits; this result applies only to the exact commit above.
- [ ] Profile visibility callable is unit-tested but not yet covered by a callable Emulator transport test or browser UI; Rules and staging remain NOT DONE.


### Public profile access and privacy settings UI — 2026-11-22

- [x] Added a shared profile access resolver: own profile reads `users/{uid}`; another user's page reads only `publicProfiles/{uid}`.
- [x] Added tests for owner/public collection selection and invalid identifiers.
- [x] Added browser ProfilePrivacyService for `updateProfileVisibilityV1` in `europe-west3`.
- [x] Added explicit privacy controls to Settings for profile visibility and each public statistic; missing preferences render as private.
- [x] Added App Check initialization from the page meta configuration slot. The privacy form remains disabled until a valid reCAPTCHA v3 site key is supplied.
- [ ] Owner profile edits still use legacy direct Firestore writes and need reconciliation with callable/server-authorized profile updates.
- [x] Privacy callable client core is dependency-injected and tested without importing browser CDN modules; the root test glob includes the new profile security suites.
- [ ] Public profile Firestore read Rules, callable transport Emulator coverage, real App Check site key, and staging remain NOT DONE.
- [ ] No deployment, Firestore Rules broadening, or production data changes.


### Owner profile read/edit callable integration — 2026-11-22

- [x] Added App Check-enforced `getMyProfileV1`; it derives the UID only from verified Auth context and rejects caller-supplied profile parameters.
- [x] AuthService now loads the private profile through the owner-scoped callable rather than a direct Firestore read.
- [x] ProfileModule uses cached owner data for the owner's page and reads only the public projection for other users.
- [x] Added App Check-enforced `updateMyProfileV1` with a strict four-field allowlist and bounded input validation.
- [x] Profile settings now use the server callable; no direct Firestore profile update or client-side username lookup remains in this form.
- [x] Username changes require a fully backfilled registry and atomically move the old/new reservation with the profile write.
- [x] Public projection refresh is in the same transaction as profile edits; invalid public projections fail closed.
- [x] Added dependency-injected browser client tests and server authorization/validation/transaction-mock tests.
- [ ] Exact-head CI and Firestore Emulator transaction test for profile edits remain pending.
- [ ] HTTPS callable transport and App Check exchange remain NOT DONE.
- [ ] Signup still contains legacy direct profile creation; Signup V2 must be wired before client writes can remain deny-all.
- [ ] Public-profile read Rules and two-account staging remain NOT DONE. No deployment or production data changes.


### Profile account Emulator coverage — 2026-11-22

- [x] Added Firestore Emulator integration scenarios for owner-only profile reads, safe public projection refresh, username reservation move and collision rollback.
- [x] Emulator suite runs under the existing serialized `test:emulator` command.
- [ ] Exact-head CI result pending.
- [ ] Callable HTTPS transport and real App Check token exchange remain NOT DONE.


### Owner profile callables — exact-head CI verified — 2026-11-22

- [x] GitHub Actions run [44999378024](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44999378024) passed on exact HEAD `fbb31b88cf42a98d3193ac0be4813155f9b6076e`.
- [x] Root unit tests: 95/95 passed.
- [x] Firestore Emulator integration suite: 14/14 passed, including owner-only profile read, safe projection refresh, atomic username reservation move and collision rollback.
- [x] JavaScript syntax check: all 61 files passed.
- [ ] HTTPS callable transport and real App Check token exchange remain NOT DONE.
- [ ] Signup V2 browser integration, path-specific public profile Rules, two-account browser staging and production migration remain NOT DONE.
- [ ] No deployment, Firestore Rules broadening or production data changes.


### Signup V2 browser integration — 2026-11-22

- [x] Added Firebase Functions client adapter for `registerProfileV2` and `getRegistrationStateV2` in `europe-west3`.
- [x] AuthService no longer queries `users` for nickname availability or writes profile/placeholder documents directly during signup.
- [x] Login no longer attempts a direct client-side `lastLogin` Firestore write.
- [x] Signup UI is wired to the server-backed V2 flow, but remains disabled unless App Check and all explicit rollout signals are enabled.
- [x] Auth bootstrap routes an authenticated account with a missing profile to the recovery form when the protected callable transport is ready.
- [x] Recovery submits only the nickname for the currently authenticated UID and confirms server state before returning to the application.
- [x] Signup failure reconciliation checks server state before considering cleanup; uncertain outcomes never delete the Auth account.
- [ ] Exact-head CI, Auth Emulator/browser flow, HTTPS callable transport and real App Check token exchange remain NOT DONE.
- [ ] Signup V2 rollout flags remain false; no legacy backfill verification or staging sign-off exists.
- [ ] No Functions deployment, Rules publication, production migration or account changes performed.


### Firebase backend readiness gate — 2026-11-22

- [x] Added a separate `firebase-functions-backend-ready` false-by-default deployment signal.
- [x] Profile and signup callable clients do not initialize/call Functions until the backend signal and App Check are both ready.
- [x] Added regression coverage ensuring profile reads/edits fail closed before the backend is declared ready.
- [ ] Real staging deploy, App Check token exchange and callable transport acceptance remain NOT DONE.
