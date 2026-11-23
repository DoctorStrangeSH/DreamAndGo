# Dream&Go V1.0 — release readiness

Дата последней сверки: 2026-11-23  
Ветка: `integration/v1.0-reconciliation`  
База текущего этапа до миграции уведомлений: `be28d242b989d3f32ab72178103b0bca1a1b417e`

> Этот документ фиксирует релизные ворота, а не объявляет готовность продукта. Галочка ставится только при наличии проверяемого результата на актуальном HEAD и, где требуется, в staging.

## Сводный статус

**Релиз: NOT READY.** Основной блокер — не unit-тесты, а отсутствие полного staging-подтверждения безопасности и реальных пользовательских сценариев.

| Область | Статус | Что подтверждено | Что блокирует DONE |
| --- | --- | --- | --- |
| Репозиторий и CI | PARTIAL | Интеграционная ветка основана на актуальном `main`; есть тестовый runner, syntax checker и Emulator workflow | Последний зафиксированный зелёный CI относится к `ce990b79c8495ffb0c406b6a83db98452d938b33`, а текущий HEAD новее; нужен exact-HEAD run |
| Регистрация V2 | PARTIAL | Серверные callables, клиентский adapter, recovery flow и fail-closed rollout gates реализованы | Реальный App Check site key, staging Functions, HTTPS callable transport, Auth/App Check end-to-end |
| Профиль и приватность | PARTIAL | Owner-scoped read/update callables, публичная allowlist-проекция и UI-настройки реализованы в candidate | Callable transport, Rules для публичной проекции, согласие и два реальных аккаунта в staging |
| Username Registry | PARTIAL | Транзакционная резервация, уникальность и закрытый migration gate покрыты тестами | Legacy dry-run, collision report, backup, rollback rehearsal и подтверждённый backfill |
| Firestore Rules | BLOCKED | Текущие candidate Rules deny-all; негативные Emulator-проверки подтверждают запрет доступа | Не реализованы и не приняты path-specific Rules; сначала согласовать client/service контракт и positive/negative matrix |
| Chat V2 | NOT VERIFIED | В roadmap зафиксированы обязательные критерии | Backend authorization, history, receipts, blocking, client integration, Emulator matrix и two-account staging |
| Остальные MUST-модули | NOT VERIFIED | Требования перечислены в PRODUCT_SPEC и DELIVERY_PLAN | Реальная интеграция с UI, права доступа, сохранность данных и staging-приёмка каждого MUST-сценария |
| Production rollout | BLOCKED | В этой ветке production Rules, Functions и данные не менялись | Отдельное подтверждение владельца после прохождения всех ворот |

## Проверяемые CI-результаты

Последний документированный зелёный запуск:

- GitHub Actions: [45001207890](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/45001207890).
- Проверенный commit: `ce990b79c8495ffb0c406b6a83db98452d938b33`.
- Unit tests: 100/100.
- Firestore/Auth Emulator tests: 14/14.
- JavaScript syntax checks: 62/62.

После указанного baseline добавлены серверные операции друзей и уведомлений, а также соответствующие unit-тесты. Эти изменения ещё не прошли exact-HEAD CI и Emulator suite. Исторический зелёный запуск не переносится автоматически на новый candidate HEAD.

## Обязательные ворота перед staging sign-off

### A. Exact-HEAD quality
- [ ] Запустить workflow `Checks` на текущем HEAD.
- [ ] Сохранить ссылку на run и job logs.
- [ ] Подтвердить unit, Emulator и syntax suites на одном commit SHA.

### B. Auth, App Check и callable transport
- [ ] Настроить отдельный staging Firebase project и корректный reCAPTCHA v3 site key.
- [ ] Проверить App Check token exchange в браузере.
- [ ] Развернуть Functions только в staging и проверить HTTPS callable transport.
- [ ] Проверить регистрацию, вход, выход, восстановление и повтор после неопределённого сетевого результата.
- [ ] Убедиться, что rollout flags остаются закрытыми до завершения всех проверок.

### C. Username Registry migration rehearsal
- [ ] Подготовить dry-run без записи в production.
- [ ] Получить collision report без лишних персональных данных.
- [ ] Проверить backup/restore и rollback на копии данных.
- [ ] Проверить идемпотентность повторного запуска и поведение при частичном сбое.
- [ ] Не открывать migration gate до формальной приёмки rehearsal.

### D. Firestore access matrix
- [ ] Для каждого пути из `FIRESTORE_ACCESS_MATRIX.md` определить owner/public/participant contract.
- [ ] Реализовать минимальные path-specific Rules только после адаптации клиентских сервисов.
- [ ] Добавить положительные и отрицательные Emulator-тесты: guest, owner A, owner B, unrelated C, chat participant и non-participant.
- [ ] Проверить запросы коллекций, а не только чтение отдельных документов.
- [ ] Не ослаблять deny-all правила ради временного обхода ошибок UI.

### E. Two-account staging
- [ ] Проверить два независимых аккаунта в двух браузерных сессиях.
- [ ] Подтвердить изоляцию профилей, коллекций, друзей и чатов.
- [ ] Проверить смену аккаунта, обновление страницы, пустые/error/loading состояния и повторные действия.
- [ ] Проверить отсутствие потери legacy-данных.

## Firestore migration plan

Подробная последовательность переноса сервисов и проверок зафиксирована в [FIRESTORE_ACCESS_MATRIX.md](FIRESTORE_ACCESS_MATRIX.md), раздел **Execution batches**.

Критический вывод аудита candidate:
- AuthService private profile read и profile edit уже переведены на owner-scoped callables.
- FriendsService всё ещё содержит прямые cross-user операции: создание заявок в подколлекции получателя, двустороннее принятие/удаление дружбы и обновление чужого счётчика.
- NotificationsService переведён на owner-scoped callable list/read; произвольное клиентское создание удалено. Achievement/level-up producers ждут серверной миграции progression, message producer — серверной миграции chat.
- DailyTasksService всё ещё меняет прогресс и claim-флаги на клиенте; награда должна начисляться атомарно и только сервером.
- Chat V2 требует отдельного canonical membership contract до включения доступа к сообщениям.

Это не разрешение расширять Firestore Rules. До завершения соответствующей серверной миграции эти пути остаются закрытыми.

## Friends and notifications — candidate implementation added

- Friend mutations (send, accept, reject, cancel, remove) use App Check-enforced callables; actor UID comes only from Auth context.
- Reciprocal friend/request records, friend counters and friend-event notifications are updated in trusted transactions.
- Friend cards and username lookup use `publicProfiles`; the friend service has no direct cross-user Firestore writes.
- Notification list/read operations use three owner-scoped callables: list, mark one read and mark all read.
- Notification list returns only an allowlisted projection; read operations can only update the authenticated owner's records.
- The browser notification service no longer creates arbitrary notification payloads or directly accesses Firestore; it refreshes the latest 30 notifications through the callable every 30 seconds.
- Added unit suites for friend and notification callable authorization, ownership, validation and transaction effects.

**Still NOT DONE:** achievement/level-up notification production (blocked on server-authoritative progression), message notification production (blocked on trusted chat send), exact-HEAD unit/Emulator run, App Check staging, Rules/reads matrix and two-account staging. Do not enable backend-ready flags or deploy.

## Следующий инженерный этап

Продолжать строго в таком порядке:

1. Exact-HEAD CI и фиксация результата.
2. Завершение Auth/App Check/callable staging-контура.
3. Username Registry migration rehearsal.
4. Path-specific Firestore Rules и полная матрица Emulator-тестов.
5. Двухаккаунтная staging-приёмка.
6. Только после этого — переход к завершению Chat V2 и следующим MUST-блокам по DELIVERY_PLAN.

## Запреты до отдельной приёмки

- Не менять `main` в рамках этой интеграционной работы.
- Не публиковать Firestore Rules в production.
- Не деплоить Functions в production.
- Не выполнять backfill, миграции или операции над реальными аккаунтами.
- Не включать signup/profile/chat rollout flags.
- Не считать наличие UI, callable или unit-теста доказательством готовности сценария.

Связанные документы: [PRODUCT_SPEC.md](PRODUCT_SPEC.md), [DELIVERY_PLAN.md](DELIVERY_PLAN.md), [ROADMAP.md](ROADMAP.md), [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md), [FIRESTORE_ACCESS_MATRIX.md](FIRESTORE_ACCESS_MATRIX.md).


## Chat V2 — private conversation backend candidate

- Added App Check-enforced callable endpoints for private chat creation, message sending, bounded history, read receipts, message status and unread count.
- Chat IDs are deterministic SHA-256 identifiers derived from the sorted pair of UIDs; canonical `chats/{chatId}` metadata stores exactly two members and a schema version.
- Creation requires reciprocal friendship and atomically creates both owner-scoped inbox summaries.
- Sending derives sender and receiver from Auth + canonical membership, bounds text to 4,000 characters, and atomically writes the message, both summaries, unread count and a notification that does not contain message text.
- History returns the latest 50 messages through an allowlisted projection; outsiders cannot access history or receipts.
- Added Chat V2 unit tests and included them in both root and Functions test runners.
- Added Firestore Emulator integration scenarios for membership, message writes, content-free notifications and read receipts; execution is pending.

**Still NOT DONE:** run exact-HEAD CI and confirm Firestore Emulator authorization/transaction coverage passes; migrate the browser ChatService/RealtimeService and UI behind a closed feature gate; preserve legacy conversations through an idempotent migration rehearsal; test two real accounts in staging. Editing/deleting messages and group chats are not included in this backend batch. No deployment, Rules expansion or data migration has occurred.


## Chat V2 browser integration and Rules candidate — 2026-11-23

- Browser Chat V2 service is feature-gated by both backend readiness and a dedicated chat rollout meta flag; both are false in the checked-in app.
- Chat contacts, private chat creation, message sends, inbox projection, paginated history and read receipts use callable endpoints.
- Message send uses a stable client-generated ID and the server performs idempotent retries without duplicating message records, notifications or unread increments.
- The chat screen subscribes to owner inbox summaries and participant messages through read-only Firestore listeners. Candidate Rules deny all client writes to chat membership, messages and inbox summaries.
- History is paginated in 50-message pages and older pages load when scrolling to the top. Read receipts for each page are applied in one server transaction.
- Account changes unsubscribe realtime listeners and clear chat IDs, cached contacts and pending retry identifiers.
- Added Firestore Rules Emulator coverage for participant A/B, unrelated C, anonymous users, owner inbox isolation, public projection reads and denied writes. Added callable Emulator coverage for inbox/contacts, idempotent sends, pagination, read receipts and membership.

**Still NOT DONE:** execute exact-HEAD CI and both Emulator suites; implement block/unblock behavior; persist the encrypted offline outbox and reconcile pending messages after reconnect/reload; rehearse legacy conversation migration without data loss; configure real App Check and staging callable transport; complete two-account browser acceptance. Do not enable `chat-v2-enabled`, change production Rules or deploy Functions before all gates pass.
