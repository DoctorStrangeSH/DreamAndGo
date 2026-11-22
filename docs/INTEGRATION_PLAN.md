# Dream&Go V1.0 — план безопасной интеграции

Дата: 2026-11-22

## Назначение

Этот документ описывает перенос проверенных изменений из `refactor/security-foundation` в отдельную интеграционную ветку, созданную от актуального `main`. Это не изменение продуктового scope: единственный источник требований — `PRODUCT_SPEC.md` и `DELIVERY_PLAN.md`.

## Зафиксированная база

- Интеграционная ветка: `integration/v1.0-reconciliation`.
- База ветки: `main` на коммите `f02171c362d5944143a1202f425cd96f2386348f`.
- Кандидатный источник: `refactor/security-foundation`, на момент аудита `60f66cd7e68530be099dfd3517b5d900b7b9814d`.
- Общий предок: `ffc60beca6d1f7840c52483019e4d8e0117de08c`.
- Ветки разошлись: `main` впереди общего предка на 53 коммита, кандидатная ветка — на 1 625.
- Изменения от общего предка: main — 22 пути; candidate — 300 путей; 20 путей пересекаются.
- PR #1 содержит 331 изменённый файл и 1 626 коммитов на момент аудита; GitHub сообщает `mergeable: false` / `dirty`. PR не является способом интеграции по умолчанию.

## Принцип переноса

1. Не переносить историю 1 625 коммитов и не сливать PR #1 целиком.
2. Считать текущий `main` источником истины для существующего приложения.
3. В пересекающихся файлах сохранить более новый baseline `main`; нужное поведение из candidate переносить вручную небольшими патчами после анализа.
4. Новые candidate-only файлы переносить только если они необходимы для MUST-сценариев V1.0 и их зависимости проверены.
5. После каждого логического пакета запускать соответствующие тесты; не объединять непроверенные пакеты.
6. Не менять production Firebase Rules, не деплоить Functions, не мигрировать пользовательские данные и не включать feature gates без отдельной staging-приёмки.

## Пересекающиеся файлы — обязательная ручная сверка

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/DELIVERY_PLAN.md`
- `docs/PRODUCT_SPEC.md`
- `js/app.js`
- `js/core/ui-components.js`
- `js/modules/achievements/achievements.js`
- `js/modules/books/books.js`
- `js/modules/chat/chat.js`
- `js/modules/dreams/dreams.js`
- `js/modules/friends/friends.js`
- `js/modules/movies/movies.js`
- `js/modules/notifications/notifications-widget.js`
- `js/modules/profile/profile.js`
- `js/modules/restaurants/restaurants.js`
- `js/modules/search/search-modal.js`
- `js/modules/settings/settings.js`
- `js/modules/travels/travels.js`
- `js/services/auth.service.js`
- `js/services/friends.service.js`

Пример существенного расхождения: `main` использует общий `js/core/security.js`, тогда как candidate использует отдельные escape/snapshot helpers. Нельзя смешивать эти реализации без проверки контрактов и XSS-покрытия.

## Пакеты интеграции

### A. Сначала аудит и тестовая инфраструктура
- [ ] Установить причину зависания/длительности `npm test` в Actions; определить конкретный медленный тест по job logs.
- [ ] Проверить `npm run check` отдельно на чистом main-based branch.
- [ ] Пересмотреть workflows candidate: triggers, concurrency/cancellation, timeout-minutes, dependency installation и Emulator lifecycle.
- [ ] Не принимать исторические тесты за результат текущего HEAD.

### B. Firebase безопасность и авторизация — MUST
- [ ] Сверить фактические client Firestore операции с access matrix и схемами V1.0.
- [ ] Перенести и проверить серверные callable функции, App Check и валидацию входных данных.
- [ ] Подготовить полные Emulator rules tests для guest / owner A / owner B / unrelated C.
- [ ] Проверить username registry и регистрацию/восстановление без глобальных клиентских запросов.
- [ ] Оставить signup rollout выключенным до staging-приёмки.

### C. Chat V2 — MUST
- [ ] Перенести backend транзакции, авторизацию участников, историю, unread/read receipts и блокировки.
- [ ] Сверить UI integration с текущим main ChatModule и его security helpers.
- [ ] Сохранить legacy history; миграция только через dry-run, backup, integrity verification и rollback rehearsal.
- [ ] Провести двухаккаунтный staging; до этого feature gate остаётся выключенным.

### D. Миграции и профиль
- [ ] Username backfill: dry-run, collision report, backup, rollback.
- [ ] Legacy collection migration: manifest, schema normalization, idempotency и integrity checks.
- [ ] Public profile projection — только явное согласие владельца; приватные поля не выдавать.

### E. Визуал и прочие MUST-модули
- [ ] Переносить только те изменения UI, которые нужны для критериев приёмки PRODUCT_SPEC.
- [ ] Не переносить preview/визуальные эксперименты, если они не входят в обязательный релизный scope.

## Текущие блокеры

- [ ] Root test + syntax + Firestore Emulator на точном интеграционном HEAD.
- [ ] Подтверждённые job logs и итоговые conclusions GitHub Actions.
- [ ] Ручная сверка 20 пересекающихся файлов.
- [ ] Staging с двумя независимыми аккаунтами.
- [ ] Backup/rollback rehearsal для любых миграций.
- [ ] Явное подтверждение владельца перед production changes.

## Definition of done для интеграции

- Все MUST-функции из PRODUCT_SPEC подключены к реальному UI и проверены на staging.
- Root tests, syntax checks, Emulator suites и security regression tests зелёные на одном точном HEAD.
- Два аккаунта не могут читать/изменять приватные данные друг друга.
- История чата и пользовательские данные сохранены; миграция имеет подтверждённый rollback.
- Ни один rollout не включён до прохождения релизных ворот.

## First P0 security/auth review — 2026-11-22

### Current main baseline (confirmed from repository tree)

- [x] `main` currently has no root `package.json`, no `tests/`, no `scripts/`, no `server/`, no `firebase.json`, and no committed `firestore.rules` file. Therefore candidate CI workflows that invoke `npm test`, `npm run check`, or Emulator suites cannot simply be copied into this branch and expected to pass; the test harness and candidate source dependencies must be ported together.
- [x] Current main already contains `js/core/security.js` with HTML escaping, internal-route allowlisting, icon/document-ID validation, bounded counters and HTTPS URL validation. This is the baseline to preserve; candidate modules that import `escape-html.js` or `home-snapshot.js` must be adapted deliberately rather than replacing the main security module.
- [x] Current main `js/config/firebase.js` initializes Firebase App/Auth/Firestore but does not initialize App Check or export Functions.
- [x] Current main `AuthService` still performs client-side username queries against `users`, creates the profile directly from the browser, and attempts to create placeholder subcollections. This is not compatible with a deny-all Firestore Rules deployment and does not provide atomic username reservation.
- [x] Current main `AuthModule` is the compact legacy form; candidate UI adds presentation and autocomplete attributes but is not required for the first security batch.

### Candidate architecture review

- [x] Candidate adds App Check bootstrap and Firebase Functions client setup in `js/config/firebase.js`; this is a required dependency for the protected callable endpoints, but the public site key/provider configuration and production App Check enforcement still require environment/staging verification.
- [x] Candidate `AuthService` has an opt-in server-backed signup/recovery path guarded by `canUseSignupV2`; its default rollout is disabled. Keep it disabled until the registry backfill and backend are verified.
- [x] Candidate `registerProfileV2` derives UID and email from Firebase Auth on the server and calls a transactional username reservation helper. The helper fails closed unless `system/usernameRegistry` is ready, schema version 1 and legacy backfill complete. This is a useful design to port with tests; it is not deploy-ready merely because the code exists.
- [x] Candidate server exports multiple callable endpoints with App Check enforcement and a large set of chat/profile/friendship/XP/daily-task dependencies. Do not port the entire `server/index.js` as one batch; split by V1.0 requirement and review every callable's auth, validation, quota, transaction and data-access contract.
- [x] Candidate Emulator config points to isolated local ports and candidate rules; it is not a production rules file. Candidate docs explicitly state that the production ruleset is not verified or replaced.

### P0 implementation sequence

1. [ ] Add a minimal, deterministic root test/syntax harness to the integration branch, with bounded execution time and no Firebase credentials. First test only the current main source baseline.
2. [ ] Port pure username normalization/validation and signup policy/flow helpers, adapting imports to main's `security.js` and adding focused unit tests.
3. [ ] Port App Check bootstrap + Firebase Functions initialization behind safe initialization handling; verify that Auth UI remains usable when App Check provider initialization fails, while protected callables fail closed.
4. [ ] Port only the username registry transaction + registration/recovery callable and its Emulator tests. Keep rollout disabled.
5. [ ] Only after those tests pass, reconcile AuthService and AuthModule with the current main implementation and confirm legacy login remains available.

### Explicit blockers / non-actions

- [ ] No confirmed current production Firestore Rules export is present in the repository. Do not author/deploy replacement production rules based solely on candidate emulator rules.
- [ ] The owner previously reported a deny-all Firestore Rules configuration and Storage is excluded from V1.0; preserve this constraint until the exact active project/database/ruleset is independently verified and the candidate rules pass two-account staging.
- [ ] No Firebase Functions deployment, App Check enforcement change, username backfill, production data write or UI rollout was performed.
- **P0 status: audit complete; implementation not yet started.**


### First integration batch — test harness and main security regression coverage — 2026-11-22

- [x] Added root `package.json` with dependency-free `npm test` and `npm run check` scripts (Node.js 22+).
- [x] Added `scripts/check-syntax.mjs`, which recursively checks JavaScript source in `js/`, `scripts/` and `tests/` and fails if no source files are found.
- [x] Added `tests/security.test.js` with six focused regression tests for HTML escaping, route allowlisting, document IDs, bounded counters, HTTPS URL validation and icon class validation.
- [x] Added a dedicated `.github/workflows/checks.yml` with read-only permissions, Node 22, a five-minute timeout and concurrency cancellation. It is scoped to the integration branch and PRs targeting main/integration.
- [ ] GitHub Actions run for integration HEAD `ceb30bedfb720bb2d239a6c3a9462d5044e1db13` is not visible yet; commit runs and combined statuses returned empty. Do not mark tests passed until execution evidence exists.
- [ ] Verify the workflow is enabled for the repository/branch or identify why push did not enqueue it; then obtain a completed run.
- **Batch status: files committed; execution unverified.** No production Firebase, main branch, user data or deployed services changed.
