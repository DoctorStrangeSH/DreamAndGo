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
