# Dream&Go V1.0 — release readiness

Дата последней сверки: 2026-11-23  
Ветка: `integration/v1.0-reconciliation`  
База текущего этапа до миграции уведомлений: `be28d242b989d3f32ab72178103b0bca1a1b417e`

> Этот документ фиксирует релизные ворота, а не объявляет готовность продукта. Галочка ставится только при наличии проверяемого результата на актуальном HEAD и, где требуется, в staging.

## Текущая проверка CI — 2026-11-23

- [x] **Exact-HEAD Checks:** [run #45240364276](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/45240364276) завершился успешно на commit `5a582e3f5aea37858cf0979956432e1aa746c8b0`.
- [x] Unit: **202/202**, Chromium: **4/4**, Auth + Firestore Emulator: **27/27**; JavaScript syntax: **109 файлов**.
- [x] В том числе проверены Friends Read / Friends mutation, Chat V2, правила доступа и синтетическое восстановление backup в Emulator.
- [ ] **Staging не подтверждён:** реальный HTTPS Callable, App Check, отдельный Firebase staging project, два браузера/аккаунта и migration rehearsal не выполнялись.
- [ ] **Release: NOT READY** до прохождения staging и контроля данных. Ни production Rules, ни Functions, ни rollout flags не включать.

## Staging preflight — зафиксированное состояние кандидата

- `index.html`: `firebase-app-check-site-key` пустой, `firebase-functions-backend-ready=false`, `chat-v2-enabled=false`, `signup-v2-enabled=false`, `signup-v2-backend-ready=false`, `signup-v2-legacy-migration-verified=false`. Все защитные переключатели остаются закрыты.
- `js/config/firebase.js`: проект `dream-and-go`; **это production-конфигурация клиента, не отдельный staging project**. Нельзя считать тестирование на этом URL безопасной staging-приёмкой.
- CI работает на изолированном demo project `demo-dream-and-go` через Emulator. Его зелёный результат не доказывает рабочий App Check или Functions deployment.
- Следующее действие: подготовить отдельный staging Firebase project с собственной веб-конфигурацией, reCAPTCHA/App Check и безопасными тестовыми аккаунтами, не меняя live `dream-and-go`. Отдельно подтвердить правила и репетицию миграции перед открытием feature gates.

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
- [x] Workflow `Checks` успешно выполнен на исходном code HEAD `5a582e3f5aea37858cf0979956432e1aa746c8b0`.
- [x] Run и job logs: [45240364276](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/45240364276).
- [x] Unit 202, Chromium 4, Emulator 27 и syntax 109 — на одном SHA.
- [ ] После документальных или кодовых коммитов проверить CI нового HEAD, прежде чем называть его exact-HEAD зелёным.

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


## Legacy conversation migration design — 2026-11-23

- [x] Legacy source paths and fields and Chat V2 target schema mapped from the current repository code.
- [x] Added [CHAT_MIGRATION_PLAN.md](CHAT_MIGRATION_PLAN.md), including safe participant-pair discovery, immutable source preservation, backup/checksum, dry-run, staging, idempotency, conflict policy and rollback rehearsal.
- [ ] No production or staging data has been read, exported, or modified. Migration remains blocked until a separate staging project, representative test data, verified backup and explicit owner approval are available.


## Chat V2 legacy inventory tool — 2026-11-23

- [x] Implemented deterministic, read-only legacy conversation analyzer and guarded Admin SDK CLI.
- [x] Added unit coverage for reciprocal summaries, malformed messages, privacy-safe hashes, legacy UID underscore collisions and production-project refusal.
- [ ] Exact-HEAD CI for this new batch must pass before marking the tests verified.
- [ ] No staging project ID/credentials are configured; no real Firestore data has been read or exported.


## Legacy message inventory completeness — 2026-11-23

- [x] Read-only scan covers all chat message collections and separately identifies V2, known group-chat, candidate legacy and orphan legacy collections.
- [x] Orphan collections are reported without inferring participant pairs from ambiguous IDs.
- [x] Local inventory output is written with owner-only file/directory permissions where supported.
- [ ] Exact-HEAD CI and staging execution remain pending; no real Firebase data has been read.


## Legacy chat inventory — exact-HEAD CI — 2026-11-23

- [x] Green CI run [45155314269](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/45155314269) on `6073403dd65000a97d28752bbe9758c3c443e2d9`.
- [x] Unit tests: 163 passed, 0 failed.
- [x] Real Chromium offline queue tests: 4 passed, 0 failed.
- [x] Auth + Firestore Emulator tests: 23 passed, 0 failed.
- [x] JavaScript syntax: 95 files passed.
- [ ] No staging Firebase project/credentials supplied; real inventory and backup have not been executed. Production remains untouched.


## Checksummed chat backup foundation — 2026-11-23

- [x] Added deterministic pure backup builder and verifier with Firestore value type preservation and per-document/bundle checksums.
- [x] Added synthetic tests for deterministic output, tamper detection, invalid paths and unsupported value types.
- [x] CI passed on `496b968e`: 174 unit tests, 4 Chromium tests, 23 Emulator tests; syntax passed for 99 JavaScript files.
- [ ] No staging export or real backup has been performed; a separate staging project and read-only credentials are still required.


## Guarded staging backup export — 2026-11-23

- [x] Added read-only Admin SDK export CLI with project allowlist, explicit non-production confirmation, exclusive output creation and owner-only local permissions.
- [x] Backup contains all user chat summaries and root chat message documents; inventory is generated from the same fetched snapshot.
- [x] Canonical V2 summary documents are excluded from legacy migration candidates by exact canonical ID verification.
- [x] CI passed on `496b968e`: 174 unit tests, 4 Chromium tests, 23 Emulator tests; syntax passed for 99 JavaScript files.
- [ ] No staging export has been run; staging credentials and project ID are not yet available.


## Backup export CLI and V2 inventory correction — 2026-11-23

- [x] Canonical Chat V2 summaries are explicitly excluded from legacy candidate pairs, with a regression test.
- [x] Added staging-only read-only backup export command; it writes private backup, inventory and report files outside the repository.
- [x] Production refusal and explicit non-production confirmation are covered by process-level preflight tests.
- [x] CI passed on `496b968e`: 174 unit tests, 4 Chromium tests, 23 Emulator tests; syntax passed for 99 JavaScript files.
- [ ] Real staging export and backup read-back remain unperformed; production remains untouched.


- [x] Full CI green on `496b968e`; latest backup completeness refinement additionally includes every root chat parent document.
- [ ] Exact-HEAD CI for the parent-document inclusion refinement pending.
- [ ] No real staging export has been run; production remains untouched.


## Backup self-verification gate — 2026-11-23

- [x] Exact-HEAD CI passed on `60fc4587` (174 unit, 4 Chromium, 23 Emulator; syntax 99 JS files).
- [x] Exporter now validates document, manifest and bundle checksums before writing any private backup artifacts.
- [ ] CI for this latest safety change pending.
- [ ] Real staging backup, independent read-back and restore rehearsal not yet performed; production untouched.


## Offline backup read-back hardening — 2026-11-23

- [x] Added offline verifier for backup bundle and inventory file.
- [x] Verifier now recalculates inventory manifest checksum against actual contents and detects tampering.
- [x] Synthetic tests cover valid read-back, modified backup message, project/checksum mismatch and modified inventory manifest.
- [ ] Exact-HEAD CI pending; no staging export has been run.

### CI wiring review — 2026-11-23

- [x] Confirmed root unit command includes the offline backup verifier regression suites.
- [x] Confirmed the serial Firestore/Auth Emulator command includes the synthetic backup restore test through the `*emulator.test.js` pattern.
- [x] Confirmed Chromium offline queue tests run separately before the Emulator suite, followed by syntax validation.
- [ ] Static review only: exact-HEAD Actions execution and job logs remain unverified.

### Latest Emulator CI failure and correction — 2026-11-23

- [x] Run `45181585519` confirmed Unit and Chromium jobs passed, but Emulator suite had two failures: unsupported Admin SDK `Bytes` import in restore test and missing reciprocal friendship in read-test fixture.
- [x] Both test-only issues corrected on `integration/v1.0-reconciliation`.
- [ ] Await latest exact-HEAD Actions run; release remains NOT READY until all checks and staging gates pass.

### Safe staging preflight added — 2026-11-23

- [x] [STAGING_PREFLIGHT.md](STAGING_PREFLIGHT.md) documents the required isolated staging environment, local configuration and two-account acceptance.
- [x] `scripts/staging-preflight.mjs` performs local fail-closed validation only: rejects production/demo projects, cross-project auth domains, production storage/Realtime Database references and open rollout switches.
- [x] Added five unit regression scenarios; source file and local JSON configuration are kept separate from production.
- [ ] Full CI on updated HEAD must pass before marking the preflight code verified.
- [ ] Actual staging project, App Check, Functions transport, two-account browser acceptance and migration rehearsal remain **NOT DONE**.

## Exact-HEAD CI evidence — 2026-11-24

- [x] Run [45241634272](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/45241634272) completed successfully on exact HEAD `64ec0846c29a83ccca10e922afc732117d962888`.
- [x] Unit: **208/208**; real Chromium offline queue: **4/4**; Auth + Firestore Emulator: **27/27**; JavaScript syntax: **111 files**.
- [x] Every workflow step passed, including dependency install, Chromium install, unit, browser, Emulator and syntax.
- [ ] Later staging-preflight hardening commits are newer than this run; run CI again on the latest HEAD before marking those changes verified.
- [ ] Actual staging Firebase, App Check token exchange, HTTPS callable transport, two-account acceptance, production Rules read-only audit and backup/rollback rehearsal remain NOT DONE.

### Latest staging preflight hardening — 2026-11-24

- [x] Preflight now requires Storage bucket to match the exact staging project ID.
- [x] Optional Realtime Database URL must be HTTPS and match the same staging project ID; unrelated project endpoints are rejected.
- [x] Added a regression scenario for cross-project Storage and Realtime Database endpoints (seven staging preflight test scenarios total).
- [ ] Exact-HEAD CI for the current branch HEAD is pending; the earlier green run predates these latest checks.

### CI browser install and staging fixture follow-up — 2026-11-24

- [x] Playwright Chromium headless shell installation passed in run `45351271008`; cache step also passed.
- [x] Unit run reported 208/209 passing; the sole failure was a test fixture retaining the old Storage bucket after changing its staging project ID.
- [x] Updated the fixture to use the matching staging bucket; no production code or Firebase configuration changed.
- [ ] Full exact-HEAD CI after this fixture correction is pending.

## Latest exact-HEAD CI — 2026-11-24

- [x] Run [45351651367](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/45351651367) completed successfully on exact HEAD `9dee2504c49740978d3ed93cfad72b9abf2782e0`.
- [x] Unit: **209/209**, including seven staging preflight scenarios.
- [x] Real Chromium offline queue tests: **4/4**.
- [x] Auth + Firestore Emulator integration tests: **27/27**.
- [x] JavaScript syntax: **111 files**.
- [x] Playwright headless-shell installation, browser cache, all test stages and cleanup passed.
- [ ] Actual isolated staging Firebase project, live App Check token exchange, HTTPS Callable deployment, two-account browser acceptance, Rules role matrix on staging, and migration backup/read-back/rollback rehearsal remain **NOT DONE**.
- [ ] Release remains **NOT READY**. Production config and Rules were not changed; no production deploy or main merge was performed.

## Branch divergence review — 2026-11-24

- [x] Reviewed the three commits present on `main` but not in the integration branch.
- [x] Compared all three add/add paths: `docs/CHAT_MIGRATION_PLAN.md`, `server/chat-migration-backup-cli.test.js`, and `server/scripts/chat-migration-backup.js`.
- [x] Integration already contains the more complete versions: backup self-verification before output creation, root chat-parent export, output-directory containment checks, and stronger read-only CLI assertions.
- [x] Closed sync PR [#3](https://github.com/DoctorStrangeSH/DreamAndGo/pull/3) without merging; the older main-side copies were not imported.
- [ ] Branch history reconciliation remains a separate maintenance task; do not merge the 654-commit integration delta into `main` as part of V1.0 staging work.
- [x] `main` and production remain unchanged.

## Final exact-HEAD CI — 2026-11-24

- [x] Run [45352559712](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/45352559712) passed on exact branch HEAD `4b34c3d7e056cc5f4071fc927b8f0cf414fddae8`.
- [x] Unit: **209/209**; real Chromium offline queue: **4/4**; Auth + Firestore Emulator: **27/27**; JavaScript syntax: **111 files**.
- [x] All workflow stages passed, including dependency install, Chromium headless-shell install/cache and cleanup.
- [ ] Actual isolated staging Firebase, App Check token exchange, HTTPS Callable deployment, two-account browser acceptance, staging Rules role matrix, and real backup/read-back/rollback rehearsal remain **NOT DONE**.
- [ ] Release remains **NOT READY**. Production config and Rules were not changed; no production deploy, rollout flag change, or merge into `main` was performed.

## Current branch divergence snapshot — 2026-11-24

- Integration branch is **655 commits ahead** and **3 commits behind** `main`.
- The three commits missing from integration were reviewed; the older duplicate/add-add copies were not imported because integration already has more complete hardened versions.
- Branch-history cleanup is intentionally separate from V1.0 staging acceptance. Do not merge the large integration delta into `main` as a release shortcut.

### Staging endpoint validation hardening — 2026-11-24

- [x] `storageBucket` values, when supplied, must be strings matching the staging project bucket.
- [x] `databaseURL` values, when supplied, must be non-empty strings using HTTPS, the exact staging project host, and an origin-only URL (no credentials, port, path, query, or fragment).
- [x] Added regression coverage for non-string endpoint values and malformed/non-origin database URLs; staging preflight now has **eight** test scenarios.
- [ ] Exact-HEAD CI for these changes is pending.
- [ ] These are static local checks only; no staging project was configured, no Firebase network calls were made, and no production settings were changed.

### Isolated staging build implementation — 2026-11-24

- [x] Added `npm run build:staging`, which creates only `dist/staging` from the static app's `index.html`, `css/` and `js/`.
- [x] Staging build embeds only the allowlisted public staging Firebase web config and App Check site key; service-account/private fields are never copied.
- [x] Build refuses invalid staging config, any source HTML rollout flag not explicitly false, duplicate runtime config, and a missing App Check meta tag.
- [x] Staging copy removes the production Firebase fallback. Missing staging marker/config or invalid/missing App Check blocks initialization rather than falling back to production.
- [x] Added five staging-build tests; generated output remains under ignored `dist/`.
- [ ] Exact-HEAD CI after this implementation is pending.
- [ ] No real Firebase project, deployment, production setting, or rollout flag was changed.
