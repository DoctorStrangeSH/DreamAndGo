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
