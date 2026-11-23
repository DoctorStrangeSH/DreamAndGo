# Dream&Go V1.0 — release readiness

Дата последней сверки: 2026-11-23  
Ветка: `integration/v1.0-reconciliation`  
База текущего этапа до миграции уведомлений: `be28d242b989d3f32ab72178103b0bca1a1b417e`

> Этот документ фиксирует релизные ворота, а не объявляет готовность продукта. Галочка ставится только при наличии проверяемого результата на актуальном HEAD и, где требуется, в staging.

## Сводный статус

**Релиз: NOT READY.** Основной блокер — не unit-тесты, а отсутствие полного staging-подтверждения безопасности и реальных пользовательских сценариев.

| Область | Статус | Что подтверждено | Что блокирует DONE |
| --- | --- | --- | --- |
| Репозиторий и CI | VERIFIED | Exact-HEAD CI run `45152046369` зелёный: Unit 150/150, Chromium 4/4, Auth + Firestore Emulator 23/23, syntax 92/92 | Полный staging sign-off и оставшиеся пользовательские приёмочные сценарии |
| Регистрация V2 | PARTIAL | Серверные callables, клиентский adapter, recovery flow и fail-closed rollout gates реализованы | Реальный App Check site key, staging Functions, HTTPS callable transport, Auth/App Check end-to-end |
| Профиль и приватность | PARTIAL | Owner-scoped read/update callables, публичная allowlist-проекция и UI-настройки реализованы в candidate | Callable transport, Rules для публичной проекции, согласие и два реальных аккаунта в staging |
| Username Registry | PARTIAL | Транзакционная резервация, уникальность и закрытый migration gate покрыты тестами | Legacy dry-run, collision report, backup, rollback rehearsal и подтверждённый backfill |
| Firestore Rules | PARTIAL | Candidate Rules now allow only public projection reads, owner inbox reads and participant chat/message reads; client writes remain denied; Rules Emulator matrix added | Exact-HEAD Rules Emulator execution, remaining owner-scoped collection policies and staging acceptance |
| Chat V2 | PARTIAL | Server authorization, callable-backed client, read-only listeners, cursor history, receipts, mutual block controls; exact-HEAD Unit/Emulator and real Chromium IndexedDB/offline queue tests are green | Two real Firebase accounts in staging, callable + App Check transport, full UI offline/reconnect acceptance and legacy migration rehearsal |
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

**Still NOT DONE:** execute exact-HEAD CI and both Emulator suites; confirm block/unblock behavior with two accounts; verify encrypted offline queue persistence and delivery after reconnect/reload in real browsers; rehearse legacy conversation migration without data loss; configure real App Check and staging callable transport; complete two-account browser acceptance. Do not enable `chat-v2-enabled`, change production Rules or deploy Functions before all gates pass.


## CI quality gates — 2026-11-23

- [x] Added a dedicated workflow for root unit tests, JavaScript syntax validation and Firestore Emulator suites.
- [x] Syntax validation includes server-side JavaScript.
- [x] Emulator job provisions Java 21 and runs Rules + Chat V2 callable tests against the demo Firestore project.
- [ ] **NOT VERIFIED:** no successful workflow run has yet been observed on the current integration HEAD. Do not treat workflow configuration as a green CI result.


## Chat block enforcement — 2026-11-23

- [x] Server-owned block/unblock records and callable operations added.
- [x] Both directions are enforced on chat creation and message send; blocked pairs are omitted from new-chat contacts.
- [x] Chat header provides block/unblock action; composer fails closed when blocked or when status cannot be verified.
- [x] Unit and Emulator regression scenarios added.
- [ ] Exact-HEAD Unit, Rules Emulator and callable Emulator results are not yet confirmed; two-account staging acceptance remains pending.


## Chat V2 encrypted offline outbox — 2026-11-23

- [x] Candidate uses IndexedDB with AES-GCM-256 encryption before message persistence.
- [x] Non-extractable encryption keys are persisted per Firebase UID; AES-GCM additional data binds each record to UID/chat/message ID.
- [x] Offline and transient network failures are queued; reconnect retries use the original idempotency ID.
- [x] Sent records are removed; permission-denied records remain encrypted and are excluded from automatic retries.
- [x] Pending messages are rendered locally with delivery-state indicators; account switch stops the prior account's active flush.
- [x] Added Node Unit tests for encryption, tamper detection, account isolation, blocked records, stable-ID delivery, retry behavior and account switching.
- [ ] **NOT VERIFIED:** execute new Unit/syntax tests on exact HEAD and verify real IndexedDB persistence across browser reloads.
- [ ] **NOT VERIFIED:** complete two-account offline → reconnect → delivery acceptance in staging. No production rollout or deployment performed.


## CI guardrails — 2026-11-23

- [x] Existing `.github/workflows/checks.yml` is the single CI entrypoint: Node.js 22, server dependency installation, root Unit suite, Auth + Firestore Emulator suite and syntax checks.
- [x] Duplicate CI workflow definitions removed.
- [x] Latest `checks.yml` run is green on HEAD `97cfe149`: 146/146 Unit tests, 23/23 Auth + Firestore Emulator tests, and syntax checks for 90 JavaScript files.


## CI acceptance — 2026-11-23

- [x] Latest CI run: [45149621722](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/45149621722) completed successfully.
- [x] Unit tests: 146 passed, 0 failed.
- [x] Auth + Firestore Emulator tests: 23 passed, 0 failed, 0 skipped.
- [x] Syntax validation: all 90 JavaScript files passed.
- [x] Test harness cursor path corrected; no production pagination behavior was changed for this failure.
- [x] IndexedDB adapter contract tests pass for persisted ciphertext/key across service recreation, account isolation, concurrent-tab key creation and blocked queue retention.
- [ ] **NOT VERIFIED:** real browser IndexedDB persistence after reload and two-account offline → reconnect → delivery acceptance remain release gates.


## IndexedDB storage verification — 2026-11-23

- [x] Added test-only `fake-indexeddb` dependency; production bundle/runtime dependencies are unchanged.
- [x] IndexedDB adapter persistence tested across service recreation, including structured cloning of non-extractable AES-GCM CryptoKeys.
- [x] Per-account isolation, concurrent tab key creation, blocked records and account-scoped queue clearing covered.
- [x] CI run [45150048398](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/45150048398) passed: 150/150 Unit, 23/23 Auth + Firestore Emulator, 91/91 JavaScript syntax files.
- [ ] **NOT VERIFIED:** real browser reload persistence and two-account end-to-end offline/reconnect acceptance. In-memory fake IndexedDB is an adapter contract test, not a browser durability proof.


## Real Chromium offline outbox verification — 2026-11-23

- [x] Added `server/chat-v2-offline-outbox.browser.test.js` and Playwright Chromium to the single `Checks` workflow.
- [x] Browser reload restores encrypted message plaintext only through the persisted non-extractable CryptoKey; the stored message body remains ciphertext.
- [x] Browser offline mode retains a queued message; reconnect delivers it using the same client message ID and clears the successful record.
- [x] Two real browser tabs concurrently write to the same account queue without losing records.
- [x] Separate browser accounts remain isolated after reload.
- [x] Exact-HEAD CI run [45152046369](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/45152046369) completed successfully: 150 Unit, 4 Chromium, 23 Auth + Firestore Emulator, 92 syntax checks; zero failures or skips.
- [ ] **NOT VERIFIED:** the browser suite uses a local fixture and simulated callable response. Real Firebase staging with two accounts, Functions/App Check, and legacy migration still requires acceptance before Chat V2 release.
