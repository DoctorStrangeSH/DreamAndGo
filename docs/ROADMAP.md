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
