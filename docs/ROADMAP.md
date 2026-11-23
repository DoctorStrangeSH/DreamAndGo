# Dream&Go — дорожная карта V1.0

Источник требований: [PRODUCT_SPEC.md](PRODUCT_SPEC.md) и [DELIVERY_PLAN.md](DELIVERY_PLAN.md). Новые продуктовые функции вне согласованного объёма V1.0 не добавлять.

Релизные ворота и подтверждённые блокеры: [RELEASE_READINESS.md](RELEASE_READINESS.md).

## Статус интеграции

- [x] Создана отдельная ветка `integration/v1.0-reconciliation` от актуального `main` (`f02171c362d5944143a1202f425cd96f2386348f`).
- [x] Проведено сравнение с `refactor/security-foundation`; общий предок — `ffc60beca6d1f7840c52483019e4d8e0117de08c`.
- [x] Подтверждено расхождение: main +53 коммита, candidate +1 625 коммитов; 22 изменённых пути в main и 300 в candidate, 20 путей пересекаются.
- [x] Создан [план безопасной интеграции](INTEGRATION_PLAN.md).
- [ ] Не переносить candidate код до ручной сверки конфликтующих файлов и проверки тестовой инфраструктуры.
- [ ] Не сливать PR #1 целиком; его GitHub-состояние на момент аудита — `dirty`.

## V1.0 — обязательные релизные ворота

### Качество приложения
- [x] Root Unit tests проходят на точном integration HEAD `46fec780` (150/150).
- [x] Синтаксическая проверка проходит на точном integration HEAD (92/92 JavaScript files).
- [x] Auth + Firestore Emulator suites проходят на точном integration HEAD (23/23).
- [x] Chromium browser suite проходит на точном integration HEAD (4/4).
- [x] Единый GitHub Actions workflow сохраняет итоговый результат и логи всех наборов; run [45152046369](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/45152046369) — SUCCESS.

### Аккаунт, приватность и безопасность
- [ ] Регистрация, вход, выход и восстановление проверены двумя независимыми аккаунтами.
- [ ] Профиль и публичная проекция соблюдают приватность по умолчанию.
- [ ] Все MUST-сценарии коллекций работают с реальными данными в staging.
- [ ] Guest / owner A / owner B / unrelated C проверки Firestore Rules пройдены.
- [ ] App Check и серверные callable проверены в staging.
- [ ] Username registry backfill имеет dry-run, collision report, backup и rollback.

### Chat V2
- [x] Серверная авторизация участников, сообщения, история, unread/read receipts и блокировки покрыты Emulator-тестами на текущем HEAD.
- [ ] Клиентская интеграция совместима с текущим main security baseline — требуется staging-проверка.
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
- [x] Exact-head CI run [45001035800](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/45001035800): 100/100 unit tests, 14/14 Emulator tests, syntax check 62/62 JS files.
- [ ] Signup V2 rollout flags remain false; no legacy backfill verification or staging sign-off exists.
- [ ] No Functions deployment, Rules publication, production migration or account changes performed.


### Firebase backend readiness gate — 2026-11-22

- [x] Added a separate `firebase-functions-backend-ready` false-by-default deployment signal.
- [x] Profile and signup callable clients do not initialize/call Functions until the backend signal and App Check are both ready.
- [x] Added regression coverage ensuring profile reads/edits fail closed before the backend is declared ready.
- [ ] Real staging deploy, App Check token exchange and callable transport acceptance remain NOT DONE.


### Signup V2 browser integration — CI verified — 2026-11-22

- [x] Exact-head CI run [45001035800](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/45001035800) passed on `e596928af9d1d5cc27771f44475c7a7c57b069ff`.
- [x] Root unit suite: 100/100 passed, 0 skipped.
- [x] Firestore Emulator suite: 14/14 passed, 0 skipped.
- [x] Syntax checker: 62 JavaScript files passed.
- [x] Signup UI, V2 service, AuthService, recovery state handling and sign-out escape are wired on the integration branch.
- [x] Direct Firestore signup/profile creation and username lookup were removed from AuthService.
- [ ] Real App Check site key/provider configuration remains NOT DONE.
- [ ] Staging Functions deployment, HTTPS callable transport and real App Check token exchange remain NOT DONE.
- [ ] Legacy username registry dry-run/backfill/collision report/backup/rollback remain NOT DONE.
- [ ] Two-account browser staging and Rules acceptance remain NOT DONE.
- [ ] All rollout meta flags remain false. No production deployment, Rules change, migration or account operation.


### Documentation and final HEAD CI confirmation — 2026-11-22

- [x] Final exact-head run [45001207890](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/45001207890) passed on `ce990b79c8495ffb0c406b6a83db98452d938b33`.
- [x] 100/100 unit tests; 14/14 Firestore Emulator tests; 62/62 JavaScript files passed syntax validation.
- [ ] App Check site key, staging deployment, real callable transport, registry migration rehearsal and two-account acceptance remain NOT DONE.


### Chat V2 backend candidate — 2026-11-23

- [x] Added App Check-enforced private-chat create/send/history/read-receipt/status/unread callables.
- [x] Canonical membership document and deterministic private chat ID are server-owned.
- [x] New-message notification contains no message body.
- [x] Added callable unit tests and registered them in both test runners.
- [x] Added Firestore Emulator integration scenarios for participant access, message writes, notification privacy and read receipts.
- [x] Add callable Emulator coverage and Firestore Rules Emulator matrix (execution pending).
- [ ] Exact-HEAD CI and successful callable/Rules Emulator execution.
- [x] Add gated ChatV2Service, callable-backed contacts/create/send/history/read receipts and account-scoped chat session cleanup.
- [x] Move inbox and message updates to read-only Firestore listeners backed by candidate participant/owner Rules; client chat writes remain denied.
- [x] Add 50-message cursor pagination and scroll-to-load-older UI.
- [x] Add stable client message IDs and server-side idempotent retry handling.
- [ ] Legacy conversation migration rehearsal; preserve all existing messages.
- [ ] Two-account staging acceptance.
- Scope lock: one-to-one private chat only in v1.0; group chat remains post-v1.0.


### Chat V2 browser and access-control integration — 2026-11-23

- [x] Added a feature-gated browser service for Chat V2 callable operations.
- [x] Routed contact discovery, private chat creation, message send, history, read receipts and inbox projection through trusted callables.
- [x] Added read-only Firestore subscriptions for owner inbox summaries and participant message history.
- [x] Added path-specific candidate Rules: public profile projection read, owner inbox read, participant chat/message read; all chat client writes denied.
- [x] Added stable client message IDs and idempotent same-ID retries.
- [x] Added 50-message cursor pagination and scroll-based older-history loading.
- [x] Batch read receipts for up to 50 incoming messages in a single transaction.
- [x] Stop listeners and clear account-scoped chat state on logout/account switch.
- [x] Block/unblock enforcement and UI added; exact-HEAD test execution and two-account acceptance pending.
- [x] AES-GCM 256 encrypted IndexedDB outbox with account-scoped non-extractable keys, reconnect retry and stable message IDs added to candidate.
- [ ] Exact-HEAD outbox tests, browser IndexedDB verification and two-account offline/online acceptance.
- [ ] Legacy chat migration rehearsal and preservation verification.
- [ ] Exact-HEAD CI, callable/Rules Emulator execution and two-account staging acceptance.
- Rollout flags remain false; no Firebase deployment or production Rules change.


### CI quality-gate coverage — 2026-11-23

- [x] Added `.github/workflows/v1-quality-gates.yml` for the integration branch and PRs targeting `main`.
- [x] Root unit tests and syntax validation run on Node.js 22.
- [x] Syntax checker now includes `server/` in addition to browser code, scripts and tests.
- [x] Firestore Rules and Chat V2 callable Emulator suites run with Firestore Emulator, Java 21 and isolated demo project.
- [ ] Await a real GitHub Actions run; workflow creation is not evidence of a passing test run.


### Chat block enforcement — 2026-11-23

- [x] Add owner-scoped server-only block records under `users/{uid}/blockedUsers/{targetUid}`.
- [x] Add block, unblock and participant-scoped block-status callables.
- [x] Reject chat creation and message sends when either participant has blocked the other.
- [x] Exclude blocked pairs from new-chat contact results.
- [x] Add block/unblock controls and fail-closed composer state to Chat V2 UI.
- [x] Add Unit, callable Emulator and Rules Emulator regression scenarios.
- [ ] Run the complete suite on exact HEAD and complete two-account staging acceptance.


### Chat V2 encrypted offline outbox — 2026-11-23

- [x] Added an IndexedDB-backed local queue; message bodies are encrypted with AES-GCM-256 before persistence.
- [x] Persisted non-extractable encryption keys are scoped per Firebase UID; queue records are isolated by UID and chat.
- [x] AES-GCM additional authenticated data binds ciphertext to UID, chat ID and client message ID.
- [x] Offline sends and transient online transport failures enter the encrypted queue; the same client message ID is reused for retries.
- [x] Reconnect triggers sequential delivery; successful records are removed, server permission denials are retained as blocked and not retried automatically.
- [x] Pending local messages are shown in the active conversation with queued/blocked indicators; account switching stops the previous account's flush.
- [x] Added Unit tests for AES-GCM encryption, tamper detection, account isolation, blocked records, stable-ID delivery, retry behavior and account switching.
- [ ] Execute Unit and syntax suites on exact HEAD; browser IndexedDB and two-account offline/online acceptance remain pending.


### CI guardrails — 2026-11-23

- [x] Consolidated CI into the existing `.github/workflows/checks.yml`; removed duplicate workflows.
- [x] Node.js 22, server dependency installation, root Unit suite, Auth + Firestore Emulator suite and syntax validation are covered in one pipeline.
- [x] Corrected pipeline is green on HEAD `97cfe149`: 146/146 Unit tests, 23/23 Auth + Firestore Emulator tests, syntax check passed for 90 JavaScript files.


### CI acceptance — 2026-11-23

- [x] Latest `checks.yml` run completed successfully: 146 Unit tests passed, 23 Auth + Firestore Emulator tests passed, 90 JavaScript files passed syntax validation.
- [x] Fixed the missing `createChatCallables` export used by callable tests.
- [x] Fixed the test Firestore mock to use `DocumentSnapshot.ref.path` for stable cursor pagination; production history query remains bounded at 50.
- [x] Removed duplicate `.github/workflows/ci.yml` and `.github/workflows/v1-quality-gates.yml`; retained the single `.github/workflows/checks.yml` pipeline.
- [x] Added real IndexedDB API contract tests with `fake-indexeddb`: persistence across service recreation, CryptoKey cloning, per-account isolation, concurrent-tab key creation and blocked queue retention.
- [ ] Real-browser IndexedDB persistence/reload and two-account offline/online staging acceptance remain pending.


### IndexedDB storage verification — 2026-11-23

- [x] Added `fake-indexeddb` as a server-side test dependency; no runtime dependency added.
- [x] Storage adapter accepts an injectable database name for isolated tests while production retains the stable default database name.
- [x] Verified encrypted message + non-extractable CryptoKey survive service/store recreation in IndexedDB.
- [x] Verified account separation, concurrent tab key creation, blocked message retention and per-account queue clearing.
- [x] CI green on HEAD `f26600a6`: 150/150 Unit tests, 23/23 Auth + Firestore Emulator tests, syntax check passed for 91 JavaScript files.
- [ ] Real browser reload and two-account end-to-end acceptance remain open; fake IndexedDB does not replace browser testing.


### Real-browser offline outbox verification — 2026-11-23

- [x] Added Playwright + Chromium browser regression suite to the single `Checks` workflow.
- [x] Real Chromium reload restores encrypted IndexedDB message content and the same non-extractable AES-GCM key.
- [x] Offline → online reconnect test confirms queued message is delivered with the original idempotency ID and then removed from local storage.
- [x] Two independent browser tabs concurrently enqueue messages for one account without losing either write or corrupting the shared key.
- [x] Separate browser accounts retain isolated queues after reload.
- [x] Exact-HEAD CI run [45152046369](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/45152046369): Unit 150/150, Chromium 4/4, Auth + Firestore Emulator 23/23, syntax 92/92.
- [ ] Staging acceptance with two actual Firebase accounts, real Functions/App Check transport, offline/reconnect delivery and legacy conversation migration remains pending.


### Legacy conversation migration design — 2026-11-23

- [x] Audited the current legacy and Chat V2 schema from the checked-in client and callable implementations.
- [x] Added `docs/CHAT_MIGRATION_PLAN.md` with read-only inventory, reciprocal-summary pair validation, backup/checksum, dry-run, staging rehearsal, idempotency, conflict handling and target-only rollback requirements.
- [x] Explicitly prohibited parsing participant pairs by splitting legacy chat IDs; UIDs may contain underscores.
- [ ] No real dataset has been inventoried or backed up; no migration has been run. Staging rehearsal and owner approval remain mandatory.


### Read-only legacy chat inventory tool — 2026-11-23

- [x] Added deterministic pure inventory analyzer and focused tests for reciprocal summaries, message integrity, privacy, UID underscore collisions and project safety gates.
- [x] Added Admin SDK CLI that only reads user chat summaries and legacy messages; writes a local JSON manifest and Markdown report, never Firestore.
- [x] Production project `dream-and-go` is hard-blocked; staging target requires exact environment allowlist and explicit non-production confirmation.
- [ ] Exact-HEAD CI for the new analyzer is running; do not mark its tests complete until the Actions run passes.
- [ ] No staging Firebase project ID or read-only credentials have been supplied; no Firestore inventory has been executed.


### Legacy message collection completeness — 2026-11-23

- [x] Inspector now scans all `chats/{chatId}/messages` collections read-only, not only those referenced by reciprocal summaries.
- [x] Existing Chat V2 collections are excluded by their parent schema version; known group-chat collections are skipped from private migration.
- [x] Orphan legacy message collections with no valid summary pair are included in the report for manual review; participant IDs are never guessed from underscore-delimited IDs.
- [x] Local output directory permissions are restricted to owner access where supported by the host OS.
- [ ] Exact-HEAD CI and staging inventory execution remain pending.


### Legacy chat inventory — exact-HEAD CI accepted — 2026-11-23

- [x] Exact-HEAD `checks.yml` run [45155314269](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/45155314269) passed on `6073403dd65000a97d28752bbe9758c3c443e2d9`.
- [x] Root Unit suite: 163/163 passed.
- [x] Real Chromium offline outbox suite: 4/4 passed.
- [x] Auth + Firestore Emulator suite: 23/23 passed.
- [x] Syntax validation: 95/95 JavaScript files passed.
- [x] Marked the new inventory analyzer and its regression tests verified by the same green CI run.
- [ ] Real staging Firestore inventory, backup, dry-run and migration remain blocked on a separate staging project and credentials.


### Checksummed legacy backup foundation — 2026-11-23

- [x] Added pure Firestore-value encoder for Timestamp, Date, bytes, GeoPoint and DocumentReference; unknown types fail closed.
- [x] Added deterministic backup bundle builder with per-document SHA-256, source inventory binding, byte totals and bundle checksum.
- [x] Added backup verifier and synthetic regression tests for tampering, duplicate paths, malformed paths and unsupported values.
- [ ] Actual staging Firestore export, private file creation and read-back verification remain pending separate staging project access.
- [ ] New backup tests are awaiting exact-HEAD CI.


### Staging backup export CLI — 2026-11-23

- [x] Added guarded read-only `server/scripts/chat-migration-backup.js`; builds inventory and checksummed backup from one Firestore read snapshot.
- [x] Export includes all user chat summaries and root chat message documents; inventory distinguishes legacy candidates from existing V2 and group records.
- [x] Existing canonical Chat V2 summaries are now explicitly skipped by the legacy inventory and covered by a regression test.
- [x] Requires exact staging allowlist and explicit non-production confirmation; production project remains blocked; local output is owner-only and exclusive-create.
- [x] CI passed on `496b968e`: 174 unit, 4 Chromium, 23 Emulator tests; syntax passed for 99 JavaScript files.
- [ ] CI for the latest parent-document backup completeness fix is pending; real staging export and backup read-back remain unperformed.


### Backup export hardening and V2 summary reconciliation — 2026-11-23

- [x] Fixed inventory classification so existing canonical Chat V2 summaries cannot be mistaken for legacy partner-ID summaries.
- [x] Added regression test for V2 summary exclusion.
- [x] Added read-only staging backup export CLI and npm command `npm --prefix server run chat:backup`.
- [x] CLI preflight requires exact project allowlist, explicit non-production confirmation, and output directory outside the repository; output uses exclusive file creation and owner-only permissions.
- [x] Added process-level safety tests for help, production refusal and missing confirmation.
- [ ] Exact-HEAD CI pending; no staging credentials/project ID supplied and no real export performed.


- [x] Backup CLI syntax issue found by process-level tests and corrected.
- [x] Full CI passed on corrected CLI commit `496b968e`.


- [x] Backup exporter now includes all root `chats/{chatId}` parent documents, even when a chat has no messages, to preserve chat metadata for restore/review.
- [ ] CI for this latest completeness fix pending; real staging backup remains blocked on staging project access.


- [x] Last full CI on `60fc4587` passed: 174 unit, 4 Chromium, 23 Emulator tests; syntax check passed for 99 JavaScript files.
- [x] Backup CLI now runs the bundle verifier before creating its output directory or writing files, and stops if any checksum/manifest check fails.
- [ ] CI for the self-verification gate commit pending; staging export still requires a separate staging project and credentials.


- [x] Refined Firestore read-only source guard to ignore in-memory Map operations while still checking Firestore write method chains.
- [x] Added offline backup read-back verifier and synthetic tamper tests, including recomputation of inventory manifest checksum.
- [ ] CI for latest offline-verification hardening pending.

### Main / integration reconciliation — 2026-11-23

- [x] Rechecked branch divergence: `integration/v1.0-reconciliation` is 546 commits ahead and 3 behind `main`; merge base is `f02171c362d5944143a1202f425cd96f2386348f`.
- [x] Inspected the three main-side changes since the merge base. They overlap with existing integration files: `docs/CHAT_MIGRATION_PLAN.md`, `server/chat-migration-backup-cli.test.js`, and `server/scripts/chat-migration-backup.js`.
- [x] Confirmed the integration backup exporter includes root `chats/{chatId}` parent documents and runs `verifyChatMigrationBackup` before creating output; the current main variant omits parent documents and does not invoke the verifier.
- [x] Confirmed the integration CLI test checks the self-verification gate and Firestore read-only behavior. The main-side test is a separate implementation and must not overwrite the stronger integration coverage.
- [ ] Reconcile these overlapping files manually before any branch merge; retain parent-document backup and pre-write self-verification.
- [ ] Run the full Checks workflow on the exact reconciled HEAD before considering a PR merge.
- **Safety:** no branch ref, application code, Firebase configuration, Firestore Rules, or production data was changed in this audit.

### Offline backup read-back verifier correction — 2026-11-23

- [x] Fixed project identity validation to compare the inventory project ID with `backup.manifest.projectId`; the backup envelope has no top-level `projectId` field.
- [x] Added process-level regression tests for a valid backup/inventory pair, cross-project inventory rejection, and credential-free help.
- [x] Registered the new verifier CLI suite in the root `npm test` command (which uses an explicit file list).
- [ ] Exact-HEAD full CI must pass before marking this correction verified.
- [ ] No real staging backup was created or inspected; no Firebase connection, migration, Rules change, or deployment occurred.

### Backup verifier output consistency — 2026-11-23

- [x] Corrected the successful read-back report to print the Firebase project ID from `backup.manifest.projectId` (the same canonical field used by validation).
- [x] Extended the CLI regression test to assert the exact project identity in successful output.
- [ ] Run the new regression suite and full Checks workflow on the resulting branch HEAD; connector status lookup currently exposes no check runs for these push commits.
- **Safety:** offline synthetic fixtures only; no staging credentials or live Firestore data used.

### Bind backup inventory to its Firebase project — 2026-11-23

- [x] Added the Firebase project ID to the inventory manifest before its SHA-256 is calculated.
- [x] Backup export now passes the explicit target project ID into inventory construction.
- [x] Offline verification checks both the inventory envelope and the project ID inside the hashed manifest against the backup manifest.
- [x] Added a regression test that changes the project ID inside the inventory manifest and recomputes its local checksum; verification still rejects it because the backup is bound to the original manifest hash.
- [ ] Exact-HEAD full CI remains unconfirmed; no staging export or Firestore restore has been run.
- **Safety:** code and synthetic fixtures only; no live Firebase reads/writes, Rules changes, or deployments.

### Synthetic backup restore rehearsal added — 2026-11-23

- [x] Fixed standalone Inventory CLI to include the explicitly selected Firebase project ID in its hashed manifest.
- [x] Added a unit regression test for project-bound inventory manifests.
- [x] Added a tagged Firestore value decoder for Timestamp, Date, Bytes, GeoPoint, and DocumentReference; Firebase dependencies are injected, not initialized by the pure module.
- [x] Reserved the serialization tag key, rejected malformed/unknown/extra-field tags, and added prototype-safe handling for special object keys.
- [x] Added a Firestore Emulator restore integration test with synthetic documents, JSON read-back, native value checks, nested paths, source/target value re-encoding checks, idempotent replay, and cleanup.
- [ ] Exact-HEAD Emulator and full CI results remain pending; no live staging dataset or Production data was touched.

### Inventory report path protection — 2026-11-23

- [x] Inventory CLI rejects filesystem roots and report output paths inside the repository before Firebase initialization.
- [x] Added a process-level regression test proving rejection happens before credential lookup.
- [ ] Exact-HEAD CI remains pending; no staging export or migration was executed.

### Migration output path hardening — 2026-11-23

- [x] Inventory and Backup CLIs share real-path validation based on the repository root, including protection against symlinks pointing into the repository.
- [x] Added tests for repository-local paths, symlink traversal, and valid external output locations.
- [ ] Exact-HEAD CI remains pending; no Firebase data was exported or modified.

### Offline verifier test suite wired into root CI — 2026-11-23

- [x] Added the existing backup-verifier regression suite to root `npm test`; previously it was not part of the workflow's unit-test command.
- [x] Corrected its synthetic Inventory fixture to carry the explicit staging Project ID.
- [ ] Exact-HEAD CI remains unconfirmed; no live Firebase data was exported or restored.


### Branch reconciliation recheck — 2026-11-23 (latest audit)

- [x] Rechecked live GitHub refs: only four branches remain — `main`, `integration/v1.0-reconciliation`, `refactor/security-foundation`, and `docs/product-spec-v1`.
- [x] Current integration divergence is 546 commits ahead / 3 behind `main`; merge base remains `f02171c362d5944143a1202f425cd96f2386348f`.
- [x] Reviewed all three main-side commits after the merge base. They overlap integration work in the migration plan, backup CLI regression tests, and backup exporter.
- [x] Kept integration's stronger backup behavior as the candidate: it includes root chat parent documents and verifies the complete backup bundle before creating output files. The current main-side exporter variant lacks those two safeguards.
- [ ] Do not merge PR #1 or reconcile refs until the overlapping changes have a reviewed, tested resolution. PR #1 still targets `refactor/security-foundation` and reports 1,626 commits / 331 changed files; it is not a safe substitute for the integration candidate.
- [ ] Exact-HEAD Actions result is still not visible through the available commit status/run lookup. A configured workflow is not a passing CI result.
- **Safety:** no branches were deleted or rewritten; no PR merged; no Firebase/Firestore production data or configuration touched.

### CI wiring audit — 2026-11-23

- [x] Confirmed root `npm test` explicitly includes both offline backup verifier suites, including the project-bound inventory regression.
- [x] Confirmed `server/package.json` runs all `*emulator.test.js` files serially through `test:emulator`; the synthetic backup restore test is included in that glob.
- [x] Confirmed Checks workflow order: unit tests → real Chromium offline queue tests → Auth/Firestore Emulator suite → JavaScript syntax check.
- [x] Confirmed Emulator project uses the non-production `demo-dream-and-go` ID and only Auth + Firestore emulators are started.
- [ ] This is a static workflow/configuration audit, not execution evidence. Exact-HEAD Actions run and logs remain unconfirmed.
- **Safety:** no workflow triggers, Firebase config, Rules, or runtime code changed in this audit.

### Direct Firestore call-site audit — 2026-11-23

- [x] Inspected the actual FriendsService, DailyTasksService, LevelService, AchievementsService, BookService and TravelService implementations against the candidate deny-by-default Rules.
- [x] Confirmed Friends UI still directly reads friends/incoming/outgoing request subcollections; matching owner-scoped list callables are not exported yet.
- [x] Confirmed daily task progress, task claims, bonus claims, XP and achievement awards are still client-authoritative and not atomic/trusted.
- [x] Confirmed Books/Travels (and the previously inventoried Restaurants/Movies/Dreams) retain direct CRUD and client-side aggregate-stat writes.
- [x] Recorded a safe implementation order in `FIRESTORE_ACCESS_MATRIX.md`; do not relax Rules to mask these blockers.
- [x] Implement owner-scoped friend list/request callables and migrate the UI reads; unit suite is added to root CI but must still be executed on exact HEAD.
- [ ] Move progression events, daily task state, XP, rewards and achievements behind trusted server transactions.
- [ ] Migrate collection CRUD and aggregate counters to explicit allowlisted server contracts.
- [ ] Exact-HEAD CI and two-account staging remain mandatory before rollout.
- **Safety:** source inspection and documentation only; no production Firestore reads/writes, Rules changes, migrations or deployments.


### Friends list reads moved behind server callables — 2026-11-23

- [x] Added three owner-scoped list callables for friends, incoming requests and sent requests. UID is derived from callable Auth; request payload must be empty; App Check is enforced.
- [x] Responses are capped at 100 records and contain only an allowlisted public-profile projection and ISO timestamps.
- [x] Migrated FriendsService list methods away from direct relationship-subcollection reads; removed its unused direct public-profile document reader.
- [x] Narrowed username-search card stats to the fields currently rendered by the Friends UI.
- [x] Added unit tests and registered the new test file in the root explicit `npm test` command.
- [ ] Execute the new unit suite and full Checks workflow on exact HEAD.
- [x] Add Emulator callable coverage for owner-scoped lists, anonymous denial, forged UID rejection and private-field exclusion; execution remains pending.
- [ ] Complete browser-level two-account staging acceptance.
- [ ] Deploy nothing until the App Check site key and callable backend are intentionally configured and staging is accepted.
- **Safety:** candidate branch code and docs only; no Rules changes, live Firebase operations or deployments.


### Friends callable Emulator regression added — 2026-11-23

- [x] Added Firestore Emulator coverage for all three Friends list endpoints, isolated owner data and unrelated account isolation.
- [x] Added assertions for anonymous access, forged UID payloads and private-field exclusion.
- [x] Corrected the Emulator host assertion and made the 100-record cap report truncation accurately via a one-record lookahead.
- [ ] Execute the new unit and Emulator tests plus full Checks workflow on exact HEAD; no passing result is claimed yet.
- [ ] Browser-level two-account staging acceptance remains pending.


### Friends UI no longer subscribes directly to Firestore — 2026-11-23

- [x] FriendsModule now loads friends, incoming requests and sent requests through the owner-scoped callable service.
- [x] Removed the three unused direct Firestore list subscriptions from RealtimeService.
- [x] Added stale-response protection when users switch tabs quickly.
- [x] Fixed competing list refreshes after accepting a request; only the active tab is refreshed.
- [ ] Browser UI regression testing and exact-HEAD CI remain pending. List updates are fetched when entering a tab and after an action; realtime list push is intentionally deferred rather than bypassing the callable boundary.


### Friends actions and counter Emulator coverage added — 2026-11-23

- [x] Added Firestore Emulator regression for sending and accepting a request, reciprocal friend records, request cleanup, removing friendship and restoring both friend counters.
- [x] Added Emulator regression for rejecting an incoming request and cancelling an outgoing request.
- [ ] Run both Friends Emulator test files with the Firestore Emulator and execute full exact-HEAD CI.
- [ ] Browser-level two-account acceptance and App Check transport verification remain outstanding.
- **Test boundary:** the new tests run callable handlers with controlled Auth context against the Firestore Emulator; they do not test HTTPS transport or App Check token exchange.

### Friends UI error-state and request efficiency hardening — 2026-11-23

- [x] Friends page now requests only the initially active Friends list instead of launching three simultaneous list requests and discarding two responses.
- [x] Relationship actions refresh only the currently visible list through one shared helper.
- [x] FriendsService no longer converts authentication, App Check, network or backend failures into an empty array. The UI's existing error state now distinguishes unavailable data from a genuinely empty list.
- [x] Missing/invalid relationship timestamps remain null rather than being replaced with the current time.
- [ ] Run exact-HEAD unit, Emulator, browser and syntax CI; no successful run is available yet.
- [ ] Complete real browser two-account acceptance and callable transport/App Check verification.

### Friends UI race and duplicate-action protection — 2026-11-23

- [x] Username search now ignores both stale successful responses and stale error responses after switching tabs or starting a newer search.
- [x] Accept, reject, cancel and remove buttons disable while their callable action is in flight, preventing accidental duplicate submissions; controls are re-enabled after a reported failure.
- [x] Reject now refreshes the currently active relationship list through the shared refresh path.
- [x] Removed obsolete subscription-state fields left behind after the Firestore realtime listeners were retired.
- [ ] Execute unit, browser, Emulator and syntax checks on exact HEAD; this branch has not yet produced an observed passing CI run.
- [ ] Real two-account browser acceptance and HTTPS Callable/App Check transport checks remain pending.

### Friends ↔ Chat V2 eligibility regression — 2026-11-23

- [x] Verified Chat V2 contact discovery is derived from the authenticated user's current `users/{uid}/friends` collection and excludes either-direction blocks.
- [x] Verified server-side private chat creation requires reciprocal friend records and rejects blocked participants.
- [x] Added a regression test modelling the committed state after friend removal: contact discovery no longer returns the former friend, and creating/recreating a private chat is denied.
- [x] Explicitly verified that removing friendship does not silently delete the pre-existing conversation from the user's inbox. Existing conversation retention is preserved.
- [ ] Execute the updated Chat V2 unit suite and full exact-HEAD CI.
- [ ] Verify the Friends → Chat V2 flow with two real staging accounts and App Check.

### Chat V2 reciprocal-contact integrity — 2026-11-23

- [x] Contact discovery now verifies both the current user's friendship record and the reciprocal record owned by the other user.
- [x] One-sided/orphaned friendship records are excluded from Chat V2 contacts instead of presenting a contact that will fail when a conversation is opened.
- [x] Added a regression test for an orphaned friendship record; private chat creation remains server-denied without reciprocal records.
- [ ] Run the Chat V2 unit suite and full exact-HEAD CI; execution is not yet observed.
- [ ] Confirm the behavior with two staging accounts after real friend removal and re-addition.

### Chat V2 conversation-open race protection — 2026-11-23

- [x] Added monotonically increasing request identity to asynchronous conversation opening.
- [x] Stale contact/profile, chat-creation and block-status responses are ignored after the user switches conversations or closes the current one.
- [x] Message subscription callbacks verify that their conversation is still the active conversation before updating the UI.
- [x] Closing a conversation invalidates any pending open operation.
- [ ] Run browser-level rapid-switch regression (A → B while A's profile/chat/block request is delayed) and exact-HEAD CI.
- [ ] Complete two-account staging acceptance; no successful browser/CI run is claimed.

### Chat V2 block-state race and transition hardening — 2026-11-23

- [x] Block-status refreshes are scoped to the active chat and ignore late responses after a conversation switch or close.
- [x] Block/unblock actions capture the target UID and chat ID; their responses cannot overwrite the UI of a subsequently opened conversation.
- [x] Switching/closing conversations invalidates pending block actions and resets only the new view's pending state.
- [x] Block/unblock confirmation no longer leaves the button in a pending state when the user cancels.
- [x] After a block mutation, the UI refreshes the authoritative server status and only reports success when the expected state is confirmed.
- [ ] Verify live block/unblock while both users have the conversation open, including immediate message-send attempts from both sides.
- [ ] Run exact-HEAD automated tests and browser acceptance; no successful CI or staging run is claimed.
