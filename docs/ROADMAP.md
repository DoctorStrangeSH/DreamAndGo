# Dream&Go — дорожная карта V1.0

Обновлено: 2026-11-20. Источник требований и границ релиза: [docs/PRODUCT_SPEC.md](PROJECT_SPEC.md). Новые функции вне этого ТЗ не добавляются в цикл V1.0. Этот документ описывает состояние ветки `refactor/security-foundation`, а не развернутого `main`.

## Направление продукта

Dream&Go — социальное пространство мечтаний, путешествий и личных открытий. Сначала стабильная приватная версия, затем безопасные публичные профили, общение и рекомендации.

## Уже в PR #1

- [x] Общая HTML-экранизация, первые исправления в мечтах, профилях, друзьях, уведомлениях и роутере.
- [x] Исправление потери маршрута при асинхронном рендеринге.
- [x] Приветственный экран для новых посетителей.
- [x] Обновлённый обзор пользователя с прогрессом первых шагов.
- [x] Проверка URL аватаров, нормализация числовых счётчиков.
- [x] Базовые Node-тесты и GitHub Actions.
- [x] README с инструкциями локального запуска.

## P0 — прежде чем открывать большой аудитории

- [ ] Полный аудит Firestore Security Rules: владельцы, друзья, приватные и публичные записи, сообщения, заявки, счетчики. Проверять через эмулятор Firebase с тестовыми аккаунтами.
- [ ] Проверить все места с `innerHTML`: чат, фильмы, книги, рестораны, путешествия, поиск, настройки и достижение.
- [x] Устранено чтение всей коллекции пользователей при поиске по нику; поиск использует ограниченный индекс нормализованных никнеймов. Серверный реестр уникальности реализован кандидатом, но остаётся выключенным до миграции.
- [x] Регистрация, вход, выход и восстановление Auth-only аккаунта покрыты Firebase Auth + Firestore Emulator journey-тестом с двумя аккаунтами; настоящий браузерный staging-прогон остаётся обязательным.
- [ ] Проверить регистрацию и восстановление в настоящем браузере на staging с включённым App Check и двумя независимыми аккаунтами.
- [ ] Проводить публичный релиз только после тестов права доступа к чужим данным.

## P1 — качество и рост

- [ ] Реально индексируемые публичные страницы, понятные настройки приватности и политики обработки данных.
- [ ] Редизайн карточек и страниц профиля, полноценные вкладки профиля вместо заглушек.
- [ ] Стабильная обработка офлайн-состояния, ошибок Firebase, загрузок и повторных действий.
- [ ] UI/e2e тесты (например, Playwright) и визуальные проверки мобильных размеров.
- [ ] Мониторинг ошибок, аналитика без чувствительных данных, performance budget.

## P2 — социальная платформа

- [ ] Лента активности и подписки с моделью приватности.
- [ ] Публикация историй выполнения мечтаний, реакции и комментарии.
- [ ] Коллекции впечатлений, рекомендации и совместные цели.
- [ ] V1.1: настройки частоты и типов уведомлений (явно вне утверждённого scope V1.0).

## Правила реализации

1. Не переносить аккаунты Firebase на другой бэкенд без миграционного плана и тестов.
2. Не полагаться на ограничения UI для доступа к персональным данным: источник истины — правила сервера.
3. Каждое крупное изменение — отдельный PR или понятная серия коммитов с тестами.
4. `main` не обновлять, пока релизные сценарии не проверены.

## Совместимость поиска никнеймов (этап миграции)

- Новые регистрации и сохранения настроек пишут `usernameNormalized` (нижний регистр).
- Поиск друзей выполняет ограниченный запрос по `usernameNormalized`; для прежних аккаунтов — запасной запрос по точному `username` без чтения всей коллекции.
- **Ограничение:** поиск старого аккаунта с другим регистром букв может не сработать до переноса данных.
- Перед миграцией существующих профилей: выгрузить резервную копию, найти конфликтующие никнеймы без учёта регистра, согласовать способ разрешения коллизий, проверить Firestore Rules, сделать пакетную миграцию на сервере.
- Проверка свободного ника в браузере **не атомарна**. Для публичного релиза нужен серверный механизм резервирования нормализованных никнеймов, защищённый Security Rules.

## Надёжность регистрации и чата

- Регистрация теперь различает занятый ник и ошибку проверки Firestore.
- Если новый Firebase Auth аккаунт создан, но запись профиля не удалась, клиент пытается удалить именно этот только что созданный аккаунт; при неудачном откате выдаёт отдельное сообщение, что требуется восстановление.
- После успешной регистрации приложение повторно загружает профиль, потому что `onAuthStateChanged` может сработать раньше записи Firestore.
- Удаление диалога имеет явные варианты «у меня», «у всех», «отмена». Результат не показывается как успешный, если операция вернула ошибку.
- **Ограничение:** массовое удаление сообщений через один Firestore batch не рассчитано на длинные переписки и должно быть заменено проверяемой серверной операцией.

## Изоляция сессий (исправления)

- [x] Асинхронная загрузка профиля проверяет ID пользователя и версию авторизации до изменения состояния UI.
- [x] При выходе и прямом переключении аккаунта снимаются Firestore-подписки и очищается отображение предыдущего пользователя.
- [x] Старые асинхронные Firestore snapshot callbacks не доставляются после отмены подписки.
- [x] Повторная подписка не может быть отменена устаревшим обработчиком очистки.
- [x] Дополнены тесты маршрутизации для неавторизованного пользователя и версии подписок.
- [ ] Требуется браузерный тест двух учётных записей с задержками сети, чтобы исключить межсессионные отображения данных при реальной работе Firebase.


## Зафиксированное направление V1.0 (2026-11-20)

- [x] Зафиксировано полное продуктово-техническое ТЗ в `docs/PRODUCT_SPEC.md`.
- [x] Определены обязательные пользовательские сценарии и критерии приёмки.
- [x] Зафиксированы release gates: безопасность Firestore, staging с двумя аккаунтами, browser QA и план отката.
- [x] Зафиксирован запрет на расширение объёма V1.0 новыми функциями; идеи после релиза остаются отдельным backlog.

## Уборка репозитория

Подробный журнал: [docs/REPO_HYGIENE.md](REPO_HYGIENE.md).

- [x] Добавлен корневой `.gitignore` без игнорирования неизвестных runtime/assets/build-папок.
- [x] Убраны две повторные записи syntax-check из `npm run check`; сами проверки сохранены.
- [x] Выполнить полную статическую инвентаризацию Git tree и крупных файлов.
- [ ] Проверить содержимое файлов и историю на секреты; завершить аудит динамических ссылок.
- [x] Инвентаризировать внешние CDN/runtime SDK и зафиксированные версии; staging-проверка доступности и CSP остаётся открытой.
- [ ] Удалять файлы только после проверки всех статических и динамических ссылок.
- [x] Проверить npm dependency graph и CI install strategy: внешние npm-зависимости отсутствуют, lockfile не требуется.
- [x] Проверить все CSS-файлы на локальные url(...) ссылки.
- [x] Сверить ссылки index.html с Git tree и удалить fallback на отсутствующие локальные Bootstrap файлы.
- [x] Заменить неполный ручной список syntax-check на автоматическую проверку всех JS/MJS/CJS в исходниках, сервере, скриптах и тестах.
- [x] Устранить риск зависания уровня и XSS через повреждённое поле XP: нормализация и ограниченный расчёт вынесены в отдельную policy, добавлены регрессионные тесты.
- [x] Подтвердить зелёный CI на точном HEAD `066e9e797092f84b521270991201830b279894cd` после security-fix.


## Следующий этап — закрытие блокеров V1.0

1. Проверить актуальные CI checks на HEAD PR #1 (старые результаты не переносить на новый коммит).
2. Провести аудит production Firestore Rules и сопоставить их с текущими клиентскими и серверными операциями.
3. Проверить staging-сценарии двух независимых аккаунтов: авторизация, приватные коллекции, друзья и чат.
4. Закрыть оставшиеся пункты `docs/RELEASE_READINESS.md` и выполнить браузерный адаптивный прогон.
5. Не объединять PR #1 и не деплоить изменения, пока блокирующие пункты не подтверждены.

## Username registry — дополнительная проверка

- [x] Выделен отдельный миграционный сервис для реестра никнеймов.
- [x] Firestore Emulator проверяет dry-run, freeze gate, идемпотентный apply, коллизии и запрет автоматического включения реестра.
- [ ] Выполнить production backup, read-only dry-run и независимую сверку без вывода персональных данных.
- [ ] Провести согласованное окно заморозки регистрации, staging rehearsal и ручное включение registry readiness только после postflight-аудита.



## Firestore V1 access matrix — 2026-11-20

- [x] Сверены фактические операции клиентских сервисов: auth, пять личных коллекций, friends, notifications, legacy chat, profile/achievements, export/search, daily tasks.
- [x] Сверены server callable и trigger операции: registration, public profile lookup, chat V2, stats/achievements, XP и daily tasks.
- [x] Создана `docs/FIRESTORE_ACCESS_MATRIX.md`: роли доступа по путям, серверные-only коллекции, несовместимости legacy API и минимальная матрица Emulator тестов.
- [x] Зафиксированы критические несовместимости: клиентское создание уведомлений для произвольного UID, cross-user writes дружбы, legacy chat writes в два профиля, legacy поиск по приватным users.
- [ ] Согласовать схемы профиля и пяти личных коллекций, публичные мечты, friendship lifecycle, notifications и cutover legacy chat.
- [ ] Получить актуальные production Rules и реальный schema inventory без PII.
- [ ] Реализовать полный deny-by-default Rules набор и покрыть все разрешённые/запрещённые операции Emulator тестами.
- [ ] Провести staging rehearsal с двумя аккаунтами и согласовать ручной rollout/rollback.


### Read-only recovery Rules — negative-test coverage

- [x] Добавлены проверки, что владелец не может создавать/изменять/удалять социальные, notification, chat и daily-task документы в ограниченном recovery prototype.
- [x] Добавлены deny assertions для server-owned XP, daily tasks, username registry/reservations, chat pairs, public profiles и Chat V2 документов.
- [x] Обновлена инструкция Emulator: эти проверки подтверждают только deny-by-default recovery prototype, а не production Rules.
- [x] Выполнить CI на новом HEAD `df122f4d484d12128ee146da5097c96c78723862`: GitHub Actions PASS, run `44778054402`.
- [ ] После согласования схем и серверных cutover-протоколов реализовать отдельные разрешённые write-paths с тестами; не расширять recovery prototype до production наугад.


### Firestore V1 data schema audit — 2026-11-20

- [x] Извлечены реальные create/update contracts из пяти collection validators и write services.
- [x] Добавлен `docs/FIRESTORE_V1_DATA_SCHEMAS.md` с полями, типами, диапазонами, enum, nested structures, лимитами и server timestamps.
- [x] Зафиксировано важное расхождение публичности: travels/books/restaurants создаются с `isPublic: true`, dreams — false, movies — без поля.
- [x] Матрица доступа уточнена: флаг `isPublic` не открывает приватный документ под `users/{uid}`; до решения владельца доступ остаётся owner-only.
- [ ] Утвердить публичную семантику каждой коллекции и сверить legacy документы без PII.
- [ ] Добавить полный набор Emulator create/update positive/negative tests для travel, book, movie и restaurant.
- [ ] Подготовить Rules candidate только после проверки схем и legacy compatibility.


### Public profile privacy gate — 2026-11-20

- [x] Найден риск: серверный callable мог формировать публичную проекцию для любого существующего аккаунта без явного согласия владельца.
- [x] Client и server projection helpers теперь fail-closed: требуется `publicProfileEnabled === true`.
- [x] Поиск ника не раскрывает профиль аккаунта без opt-in; прямой lookup возвращает generic not-found.
- [x] Migration script пропускает приватные/не opted-in аккаунты и не перезаписывает существующие проекции.
- [x] Username collisions проверяются по всем аккаунтам, включая приватные, чтобы не допустить неоднозначного публичного поиска.
- [ ] Добавить явную настройку приватности профиля в UI и owner-only Rules для изменения флага.
- [ ] Перевести `FriendsService.getUserByUsername` с прямого клиентского чтения `users` на `findPublicProfileByUsernameV2`; сейчас legacy путь ещё запрашивает приватную коллекцию и будет несовместим с deny-by-default Rules.
- [ ] Добавить Emulator-тесты для opt-in, opt-out, смены видимости и прямого доступа к private/public documents.


- [x] CI на HEAD `515c9861f2d49895c34bfc027d5fbac3347261f2` прошёл успешно: [run 44780842923](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44780842923).


### Public profile client cutover — 2026-11-20

- [x] Добавлен batch callable `getPublicProfilesV2`: Auth + App Check, до 50 UID на запрос, один расход квоты на batch.
- [x] Добавлен browser service `public-profile-callable.service.js` с пакетной загрузкой группами до 50.
- [x] `FriendsService`: поиск по нику и загрузка друзей/заявок/исходящих заявок идут через защищённые callable; прямое чтение чужих `users/{uid}` удалено из сервиса.
- [x] `ProfileModule`: чужой профиль загружается через callable; прямой read `users/{uid}` оставлен только для собственного профиля.
- [x] Добавлены тесты на client cutover и server batch projection.
- [ ] Проверить полный flow на Firebase Emulator и staging с двумя аккаунтами; callable rollout требует App Check.
- [ ] Реализовать owner-facing opt-in UI и серверное изменение видимости; до этого публичные профили остаются выключенными по умолчанию.


### Public profile owner consent control — 2026-11-20

- [x] Добавлена настройка «Публичный профиль» в Settings; отсутствие флага отображается как выключенное состояние.
- [x] Включение/выключение выполняется только через Auth + App Check callable `setPublicProfileVisibilityV2`; браузер не пишет privacy-флаг напрямую.
- [x] Отключение доступно сразу; включение закрыто до завершения username registry backfill и подтверждения reservation UID.
- [x] Добавлена серверная policy с проверкой владельца, схемы реестра, нормализованного никнейма и принадлежащей пользователю резервации.
- [x] Добавлены unit-тесты server policy и UI/callable wiring.
- [ ] Прогнать Firebase Emulator и staging с двумя аккаунтами; проверить включение/отключение, поиск, прямой lookup и отсутствие утечки приватных полей.
- [ ] Завершить production username registry backup/dry-run/backfill; до этого публичность нельзя включить.


### Verification note — public profile privacy control

- [x] Root CI `test` job passed on implementation HEAD `8a570eeee68fad84574ded2bd8bdf7297fd18ad1` ([run 44796782146](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44796782146)).
- [ ] Emulator/staging two-account journey remains outstanding; production rollout remains blocked on username registry backup/dry-run/backfill and live Rules/App Check verification.


### Privacy flag abuse regression coverage — 2026-11-20

- [x] Emulator rules tests explicitly deny owner browser writes of `publicProfileEnabled: true` and `false`; only the server callable may mutate consent.
- [x] Client and server projection tests assert `publicProfileEnabled` is never returned in public profile payloads.
- [x] Re-ran Firebase Emulator workflow on `c4c50b130cb8a4b64ead9615fac7be039df17c4e`; candidate rules and server emulator tests passed ([run 44799092635](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44799092635)).


### Privacy regression CI and branch reconciliation — 2026-11-20

- [x] Root `Checks` CI passed on HEAD `0a7b40379abb7d48f0b2ea86e244b49752c2a5f6` ([run 44797565985](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44797565985)).
- [x] Firebase Emulator candidate-rules suite passed on commit `8a498cf65fc00c5b9bda0900ced6f487751009c8` ([run 44797490658](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44797490658)).
- [x] Direct client writes to `publicProfileEnabled` are explicitly denied in the candidate Rules tests; public DTOs omit the consent flag.
- [ ] PR #1 branch reconciliation remains open: feature branch is 53 commits behind current `main` and GitHub reports a divergent history. Do not merge until a controlled rebase/merge conflict review and fresh CI.


### Server unit test coverage in default CI — 2026-11-20

- [x] Root `npm test` now runs both `tests/*.test.js` and `server/*.test.js`.
- [x] Added five focused tests for profile lookup quota limits, expiry boundaries, malformed state recovery, per-user isolation, and input validation.
- [x] Fixed a previously unexecuted profile statistics test expectation (`friends: 0`).
- [x] Root Checks passed on `c4c50b130cb8a4b64ead9615fac7be039df17c4e` ([run 44799092633](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44799092633)).
- [x] Firebase Emulator suite passed on the same HEAD ([run 44799092635](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44799092635)).
- [ ] PR #1 branch reconciliation remains blocked pending controlled integration with current `main`; do not force-push or merge the divergent history.


### Friendship writes moved behind trusted server callable — 2026-11-20

- [x] Added `mutateFriendshipV2` with Auth + App Check; actor UID is derived exclusively from Firebase Auth.
- [x] Added transactional server operations for send, accept, reject, cancel and remove.
- [x] Request resolution validates both the recipient-owned incoming record and sender-owned outgoing index before changing either side.
- [x] Friendship removal verifies both reciprocal friend documents before deleting either.
- [x] Removed direct cross-user Firestore writes from `FriendsService`; the browser now calls the server endpoint.
- [x] Fixed outgoing-request cancellation so it is performed by the authenticated sender, not by impersonating the recipient.
- [x] Added eight server transaction tests and client/callable contract checks.
- [x] Root Checks passed on `fd0ccc2f219758744135e066eda457de27c94440` ([run 44800645445](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44800645445)).
- [ ] Run a real staging journey with two accounts and verify deployed Functions + App Check before rollout.
- [x] Client-side notification creation was removed from `notifications.service.js`; the service is owner-bound. Remaining notification authorization is tracked under SEC-NOTIFY-01…05 and the production Rules gate.


### Notification client-write removal — 2026-11-21

- [x] Removed the generic browser-side notification creation API that accepted an arbitrary recipient UID and arbitrary payload.
- [x] Bound notification subscription and read-state mutations to the active Firebase Auth UID; stale snapshots are ignored after account changes.
- [x] Added notification document-ID validation and regression tests in `tests/notifications-service-security.test.js`.
- [x] Implement trusted server-generated notifications for friendship request/acceptance and newly awarded achievement levels; all writes use fixed server-derived payloads.
- [x] Implement trusted message notifications in the candidate server-side message transaction; do not restore a generic client-selected recipient API.
- [x] Add isolated notification Rules Emulator tests for owner reads and owner-only one-way read-state updates; production Rules integration remains a separate release blocker.
- [ ] Run the notification flow in staging with two independent accounts and App Check.
- **Status:** the arbitrary client notification-write path is removed from the candidate client. The V1.0 notification feature is not complete until trusted event generation and Rules/staging acceptance are verified.


### Trusted friendship notifications — 2026-11-21

- [x] `mutateFriendshipV2` now creates a fixed-schema `friend_request` notification in the recipient's own notification subcollection in the same Admin SDK transaction as the paired request records.
- [x] Accepting a valid incoming request creates a fixed-schema `friend_accepted` notification for the original sender in the same transaction as the symmetric friendship records and request deletion.
- [x] Recipient, actor, message text, icon, color, route, read state and timestamp are derived by server code; no client notification payload is accepted.
- [x] Notification IDs are deterministic per actor/event type, so callable retries cannot create an unbounded series of duplicate notification documents.
- [x] Extended friendship transaction tests to assert exact notification recipient, schema and transaction write.
- [x] Add trusted server-side notification generation for friend, achievement and private-message events; achievement and message event writes are covered by dedicated transaction/Emulator tests.
- [x] Complete notification-specific Rules Emulator tests: 7/7 Rules tests and 59/59 server/Auth/Firestore Emulator tests passed (run 44893915020).
- [ ] Complete two-account staging validation with App Check.
- **Status:** all three notification event sources are implemented in candidate code; they are not production-ready until Rules and staging acceptance.


### Friendship notification lifecycle cleanup — 2026-11-21

- [x] Pending friend-request notifications are removed transactionally when the sender cancels the request.
- [x] Pending friend-request notifications are removed transactionally when the recipient accepts or rejects the request.
- [x] The acceptance notification is created for the original requester in the same transaction; stale actionable request notices do not remain in the recipient inbox.
- [x] Regression tests cover pending-notification cleanup for cancel/reject/accept paths.
- [x] Root Checks passed: 461/461 tests and syntax checks for 253 JavaScript files on candidate implementation HEAD `d311e26065e01d5044e73f049c4629988dd5cf9b` ([run 44893286852](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44893286852)); current docs-only HEAD Checks also passed ([run 44893346213](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44893346213)).
- [x] Firebase Emulator workflow passed: 6/6 Firestore rules tests and 59/59 server/Auth/Firestore emulator tests on implementation HEAD `d311e26065e01d5044e73f049c4629988dd5cf9b` ([run 44893286823](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44893286823)). The existing rules suite is not a notification-specific access test.
- [x] Add an isolated notification Rules Emulator fixture: owner-only reads, guest/cross-user denial, no client create/delete, and one-way owner `read: false → true` updates; the fixture is explicitly not production Rules.
- [ ] Integrate the approved notification contract into the eventual complete production Rules and complete staging two-account verification.


### Trusted achievement notifications — 2026-11-21

- [x] Server-side profile refresh now writes a fixed-schema `achievement` notification for each newly awarded achievement/level in the same Firestore transaction as the profile achievement update.
- [x] Notification recipient is the authenticated user's own profile path; message, icon, color, route, achievement ID and level are derived from the trusted achievement catalog/policy result.
- [x] Stable document IDs (`achievement_{id}_level_{level}`) prevent duplicate notifications when the stats callable is retried after an award.
- [x] Extended the Firestore Emulator profile-stats journey to verify the exact notification schema and idempotent repeat refresh.
- [ ] Verify root tests, syntax checks and Emulator workflow on the exact updated candidate HEAD.
- [x] Complete isolated owner-only notification Rules tests (7/7 Rules tests; run 44893915020).
- [ ] Complete two-account staging validation with App Check.


### Trusted private-message notifications — 2026-11-21

- [x] The candidate `sendPrivateMessageV2` transaction now creates the recipient's fixed-schema `message` notification alongside the message, chat sequence, previews and unread increment.
- [x] Notification recipient is derived from the validated chat participant pair; sender, chat ID and a bounded 120-character preview come from the trusted transaction inputs.
- [x] Deterministic `message_{serverMessageId}` document IDs make retries idempotent: a repeated message request returns through the existing-message branch and cannot increment unread or create another notice.
- [x] Emulator regression coverage checks the exact payload and verifies that retries leave exactly one notification.
- [ ] Verify the new Emulator workflow and final candidate Checks on the exact HEAD.
- [x] Add isolated notification Firestore Rules tests for owner reads, immutable event fields, server-only create/delete and owner-only `read: false → true` updates; server-created notices remain client-uncreatable.
- [ ] Validate friend, achievement and message notices with two staging accounts and App Check.


### Notification milestone verification — 2026-11-21

- [x] Root Checks passed on candidate HEAD `05961cb3bcec5f6fbe6b70e84f2b261c700e9237`: 461/461 tests, 0 failures; syntax checks passed for 254 JavaScript files ([run 44893947666](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44893947666)).
- [x] Firebase Emulator workflow passed after the notification Rules fixture was added: 7/7 isolated Rules tests and 59/59 server/Auth/Firestore Emulator tests ([run 44893915020](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44893915020)).
- [x] Trusted friend, achievement and private-message notification event sources are implemented in candidate server transactions; message retry idempotency and achievement repeat-refresh idempotency are covered.
- [ ] Production Rules integration, review of the actual active Firebase Rules, and two-account staging validation with App Check remain release blockers. No root `firestore.rules` or `firebase.json` is present in this candidate branch; isolated test fixtures must not be deployed.


### Current continuation checkpoint — 2026-11-21

- [x] Re-read the live PR #1 metadata and current candidate HEAD: `2b938f4513400fc11fb2be3ec61690056c626f00`.
- [x] Confirmed the notification implementation milestone remains complete in candidate code: trusted friend-request/acceptance, achievement and private-message events; isolated notification Rules tests cover owner reads, server-only creation/deletion and one-way read-state updates.
- [x] Confirmed the private-collection visibility hardening: new writes in all five personal collection services no longer set `isPublic`; existing records were not migrated or modified.
- [ ] Run root Checks and Firebase Emulator workflows on the exact current HEAD. GitHub currently returns no status checks/workflow runs for this SHA; historical green runs are not evidence for this HEAD.
- [ ] Build a separate, complete Firestore Rules candidate from the approved V1.0 access matrix and five collection schemas. Do not turn the limited recovery fixture into production Rules by incremental broadening.
- [ ] Add positive and negative Emulator CRUD coverage for travels, books, movies and restaurants, including immutable `createdAt`, server `updatedAt`, nested payload validation, owner/guest/second-account isolation and legacy compatibility.
- [ ] Complete signup V2 and Chat V2 client cutovers before considering any relaxation of the published deny-all Rules.
- **Safety boundary:** production Rules remain unchanged. Test fixtures are not deployable production configuration.


### Book page-count invariant — 2026-11-21

- [x] Found a partial-update gap: changing only `currentPage` or only `totalPages` was validated without the persisted counterpart.
- [x] Added `validateBookUpdateInput(existing, updates)` to validate merged page bounds while preserving partial-update semantics for unrelated fields.
- [x] `BookService.updateBook` now reads the existing owner-scoped document before applying a partial update and rejects missing books or inconsistent page counts.
- [x] Added regression cases for current-page overflow, reducing total pages below the current page, malformed legacy counters and unrelated partial edits.
- [ ] Run root CI and Firebase Emulator checks on the exact implementation HEAD; no checks are currently reported for the latest commit.
- [ ] Enforce the same invariant atomically in the final Firestore Rules candidate; the client read-before-write check is defense in depth and is not race-proof by itself.


### Book service validator wiring regression — 2026-11-21

- [x] Follow-up review caught and fixed a missing `validateBookInput` import after the partial-update validator was introduced; without it, adding a book would fail at runtime.
- [x] Added `tests/book-service-validator-wiring.test.js` to assert that both create/update validators are imported and called by `BookService`.
- [ ] Run root CI on the exact resulting HEAD; GitHub has not reported checks for the latest candidate commits.


### Atomic book page-bound validation — 2026-11-21

- [x] Upgraded the book partial-update consistency check from a separate read/write pair to a Firestore transaction.
- [x] The transaction reads the existing book, validates the merged `currentPage`/`totalPages` invariant and writes the allowlisted update atomically.
- [x] Extended the BookService wiring regression test to require transactional read/validate/write call sites.
- [ ] Execute root test suite and Emulator workflows on the exact latest HEAD; no CI result is assumed until GitHub reports it.
- [ ] Mirror the same invariant in authoritative Firestore Rules; client transaction validation remains defense in depth, not authorization.


### Travel write-result consistency — 2026-11-21

- [x] Fixed `TravelService.addTravel`: after Firestore confirms `addDoc`, a derived-statistics refresh failure is logged but cannot turn the committed create into a reported failure.
- [x] Applied the same rule to `updateTravel`: a committed document update remains successful if the secondary statistics refresh fails.
- [x] Added `tests/travel-service-write-result.test.js` to guard both committed-write result paths.
- [x] Added validator coverage for complete nested budget-map replacement and rejection of incomplete, malformed or out-of-range budget maps during partial updates.
- [ ] Run the root test suite and Firebase Emulator workflows on the exact resulting HEAD; no CI pass is claimed yet.


### Movie write-result consistency — 2026-11-21

- [x] Fixed `MovieService.addMovie`: after Firestore confirms `addDoc`, failure to refresh derived user statistics is logged but does not report the committed movie create as failed.
- [x] Applied the same behavior to `updateMovie` after a committed `updateDoc`.
- [x] Added `tests/movie-service-write-result.test.js` to guard both primary-write result paths.
- [x] Expanded movie input regression coverage for impossible calendar dates and duplicate genre IDs.
- [ ] Run root tests and Firebase Emulator workflows on the exact resulting HEAD; no CI pass is claimed yet.


### Restaurant write-result consistency — 2026-11-21

- [x] Fixed `RestaurantService.addRestaurant`: after Firestore confirms `addDoc`, a failed derived-statistics refresh is logged but does not report the committed create as failed.
- [x] Applied the same behavior to `updateRestaurant` after a committed `updateDoc`.
- [x] Added `tests/restaurant-service-write-result.test.js` to guard both committed-write result paths.
- [x] Expanded restaurant validator coverage for invalid status, impossible visit dates, rating bounds, favorite-dish list limits, photo list limits and nullable visit dates.
- [ ] Run root tests and Firebase Emulator workflows on the exact resulting HEAD; no CI pass is claimed yet.


### Cross-collection CRUD statistics consistency — 2026-11-21

- [x] Audited create/update/delete paths for dreams, travels, books, movies and restaurants.
- [x] Added a shared per-service `updateUserStatsBestEffort(userId)` wrapper and routed all 15 collection CRUD operations through it.
- [x] Secondary statistics refresh failures are logged and cannot turn an already committed primary write/delete into a false failure response.
- [x] Added `tests/collection-crud-stats-best-effort.test.js` to guard all five services and all 15 CRUD entry points.
- [ ] Run root tests and syntax checks on the exact current HEAD; no CI pass is claimed yet.
- [ ] Add emulator integration coverage for successful and denied CRUD operations, including server timestamps and cross-account access.


### Firestore Rules candidate — first collection slice (travel) — 2026-11-21

- [x] Created isolated `tests/firebase-emulator/collections-v1.rules` from the read-recovery fixture; it is explicitly test-only.
- [x] Added a schema-specific owner CRUD rule for `travels`, including exact top-level allowlist, required fields, bounded strings, type/status enums, exact nested budget keys and bounds, HTTPS photo list validation, rating bounds and immutable/server timestamp checks.
- [x] Added `collections-v1.rules.test.mjs` for owner CRUD, guest/second-account isolation and invalid payloads.
- [x] Added the new test to `tests/firebase-emulator/package.json`.
- [ ] Run the Emulator suite against the exact candidate HEAD and fix any Rules compiler/runtime failures.
- [ ] Add equivalent isolated Rules + Emulator coverage for books, movies and restaurants. Dreams retain their existing isolated schema rule but need broader CRUD/timestamp tests.
- **Safety:** this is not the production Rules file. Existing production deny-all remains untouched; no deploy performed.


### Firestore Rules candidate — books slice — 2026-11-21

- [x] Added an explicit schema-specific owner CRUD matcher for `users/{uid}/books/{bookId}` to the isolated V1 fixture.
- [x] Enforced exact field allowlist, required title/author/status/notes/timestamps, status/genre allowlists, year/page/rating bounds, page cross-field invariant, review/quote bounds and immutable/server timestamps.
- [x] Added `books-v1.rules.test.mjs` covering owner CRUD, guest/other-user denial and invalid book payloads.
- [x] Included the book test in the Emulator package script.
- [ ] Execute the complete Emulator suite on the exact current HEAD; no test pass is claimed.
- [ ] Continue with movies, restaurants and broader dreams CRUD coverage.


### Firestore Rules candidate — movies slice — 2026-11-21

- [x] Added schema-specific owner CRUD rules for `users/{uid}/movies/{movieId}` in the isolated V1 fixture.
- [x] Enforced the movie field allowlist, required movieId/title/status/notes/timestamps, TMDB metadata bounds, HTTPS artwork or explicit null, allowed genre IDs, production-country map schema, rating/count/runtime/budget ranges and timestamp integrity.
- [x] Added `movies-v1.rules.test.mjs` covering owner CRUD, guest/other-user denial and invalid metadata payloads.
- [x] Aligned the client validator to accept null artwork (TMDB may omit it) and require uppercase two-letter country codes.
- [x] Included the movie test in the Emulator package script.
- [ ] Execute the complete Emulator suite on exact HEAD; no pass is claimed.
- [ ] Restaurants and expanded dreams CRUD coverage remain open.


### Firestore Rules candidate — restaurants slice — 2026-11-21

- [x] Added explicit owner CRUD rules for `users/{uid}/restaurants/{restaurantId}` in the isolated V1 fixture.
- [x] Enforced field allowlist, required name/cuisine/status/notes/timestamps, cuisine/status enums, address/date bounds, bill/rating bounds, favorite-dish and HTTPS photo limits, review length and timestamp integrity.
- [x] Added `restaurants-v1.rules.test.mjs` for owner CRUD, guest/other-user denial and invalid restaurant payloads.
- [x] Included the restaurant test in the Emulator package script.
- [ ] Execute the complete Emulator suite on exact HEAD; no pass is claimed.
- [ ] Expand dreams CRUD coverage and review cross-collection compatibility before any production Rules release.


### Firestore Rules candidate — dreams slice and five-collection coverage — 2026-11-21

- [x] Audited the dedicated `dream-input-policy.js` and existing dream Rules schema.
- [x] Added explicit Emulator CRUD/owner-isolation/schema tests for dreams.
- [x] Closed a visibility gap: new dream documents cannot set `isPublic: true`; optional visibility must be boolean and cannot be changed by clients.
- [x] Preserved compatibility for legacy documents that already have `isPublic: true`: owners can still edit other allowed fields without changing visibility.
- [x] Included the dreams test in the Emulator package script.
- [x] All five private collection families now have explicit schema-specific Rules candidates in the isolated fixture: dreams, travels, books, movies and restaurants.
- [ ] Run the full Emulator suite against exact HEAD and fix compiler/runtime failures.
- [ ] Complete a cross-collection contract audit and verify legacy document compatibility before any production Rules release.
- **No production Rules change or deploy.**


- [x] Follow-up static review closed a legacy visibility edge case: clients cannot add `isPublic` to old documents where the field was absent; existing field values remain immutable.


- [x] Added dedicated GitHub Actions workflow `.github/workflows/firestore-rules-emulator.yml` to execute the isolated Firestore Rules Emulator suite on pushes to the security branch and relevant pull-request changes.
- [ ] Confirm the first CI run completes successfully; workflow creation is not a test pass.

- [x] Isolated each Firestore Emulator test suite under its own Firebase project ID to prevent parallel Node test files from overwriting each other's Rules or data.


### Client-to-Rules contract verification — 2026-11-21

- [x] Added an integration test that feeds the real client-side validators for dreams, travels, books, movies and restaurants into the isolated Firestore V1 Rules fixture.
- [x] Uses the same server timestamp fields and service-added `notes` metadata used by create services for books, movies and restaurants.
- [x] Included the contract suite in the Emulator package test script.
- [ ] Execute the contract suite and full Emulator suite in CI; no pass is claimed.

- [x] Extended the client-to-Rules contract test to cover partial updates, immutable creation timestamps, and owner deletion across all five private collections.
- [ ] Execute the expanded Emulator contract suite and full suite in CI.


### Legacy collection compatibility audit — 2026-11-21

- [x] Added `legacy-collection-compatibility.test.mjs` with historical-shape fixtures for all five private collections.
- [x] Verified owner direct-read and delete access remain available for legacy documents.
- [x] Verified documents without `createdAt` are omitted by the current `orderBy('createdAt')` list-query pattern.
- [x] Verified strict V1 update Rules reject incomplete/old-shape records instead of silently accepting malformed writes.
- [ ] Design and implement a reviewed, dry-run-first migration/normalization path for legacy documents before strict V1 Rules can be deployed.
- [ ] Decide how list services should surface legacy documents missing `createdAt` without silently dropping them.
- **Release remains HOLD; no production Rules or data migration performed.**


### Offline legacy inventory tooling — 2026-11-21

- [x] Added `js/core/legacy-collection-audit.js` for privacy-safe schema inventory across all five private collections.
- [x] Added `scripts/audit-legacy-collections.mjs` and `npm run audit:legacy-collections`; reads only a local minimized JSON snapshot and emits aggregate counts without IDs or values.
- [x] Added `tests/legacy-collection-audit.test.js` for missing timestamps, unknown fields, invalid statuses, malformed records and output redaction.
- [ ] Run the tool against an owner-exported, minimized metadata snapshot (not raw production data in chat) and review aggregate results.
- [ ] Only after reviewing real field names/statuses, define an explicit versioned migration mapping and dry-run planner. No migration is implemented.

- [x] Hardened the legacy inventory input contract: it now accepts metadata-only records (field names, coarse types and categorical status), rejects document IDs/raw data fields, and includes a sanitized example JSON.

- [x] Fixed a duplicate timestamp-constant declaration in the offline auditor before further work.
- [x] Extended legacy inventory to detect field-type mismatches against the V1 contract for all five collections; CLI now exits non-zero when a type mismatch is found.
- [ ] Execute root test suite and syntax checks on the exact latest commit; no runtime pass is claimed.

- [x] Extended the Firestore Emulator GitHub Actions workflow to run root unit tests and repository syntax checks before the Emulator suite; relevant code/test changes now trigger the PR workflow.
- [ ] Confirm all three CI stages pass on the latest PR head.


### Legacy migration manifest — 2026-11-21

- [x] Added a versioned, fail-closed manifest validator for all five private collections.
- [x] Require explicit per-field actions: keep, rename, drop (with data-loss approval), default, or documented manual review.
- [x] Require manifest approval, backup reference, and verified rollback before a manifest can validate.
- [x] Added offline manifest validation CLI and unapproved template.
- [x] Added tests for missing collection coverage, unapproved manifests, unresolved manual review, destructive drops, missing rename targets/defaults, and inventory blockers.
- [ ] Populate mappings only after reviewing real metadata-only inventory; no legacy aliases are guessed.
- [ ] Implement a separate dry-run document planner only after mappings and source schema are approved.
- [ ] Perform staging rehearsal and verify backup/rollback independently. No migration execution is implemented.

- [x] Migration manifest rejects placeholder/unknown source schema IDs and validates every mapped status against the target V1 enum for its collection.


### Aggregate legacy migration dry-run planner — 2026-11-21

- [x] Added an offline planner that consumes only the sanitized aggregate inventory and a validated manifest.
- [x] Reports per-collection field actions, document counts and status mappings without reading record values or IDs.
- [x] Detects unmapped source fields, unsupported target fields, target collisions and invalid/unmapped target statuses.
- [x] Explicit manifest mappings can resolve unknown legacy fields/statuses; unresolved structural/timestamp/type gaps remain blockers.
- [x] Added CLI `npm run plan:legacy-migration -- manifest.json inventory.json`.
- [x] Added tests for clean plans, unmapped fields, collisions, status remapping, inventory blockers and sanitized-input enforcement.
- [ ] Execute root tests and syntax checks in CI on the exact current head.
- [ ] Build document-level normalization only after actual legacy metadata and mapping approvals. Planner is report-only and never executable.


### Synthetic document normalizer — 2026-11-21

- [x] Added a pure document normalizer that applies only approved keep/rename/drop/default/status-map decisions.
- [x] Requires a fully valid and approved Migration Manifest before processing a document.
- [x] Validates normalized output against collection-specific V1 allowlists, enums, types, bounds, nested structures and required fields.
- [x] Added synthetic fixtures for all five collections and regression tests for mapping, defaults, drops, status conversion, invalid data, collisions and source immutability.
- [ ] Run full unit suite and syntax checks in CI on the exact current PR head.
- [ ] Add a separate synthetic rollback/reversibility rehearsal; do not connect this module to Firebase or real user data.


### Synthetic migration rehearsal — 2026-11-21

- [x] Added all-or-nothing in-memory rehearsal across the five V1 private collections.
- [x] Reuses the approved-manifest-gated document normalizer for every synthetic document.
- [x] Any invalid entry/document blocks the entire batch; no partial normalized batch is returned.
- [x] Preserves an immutable source snapshot and returns a rollback preview for comparison.
- [x] Added CLI `npm run rehearse:legacy-migration -- manifest.json synthetic-documents.json`.
- [x] Added regression coverage for all five collections, atomic failure, input immutability, malformed entries and unsupported collections.
- [ ] Run complete unit tests and syntax checks in CI on the exact current PR head.
- [ ] Perform a separate staging backup/restore rehearsal only after security review and explicit approval. The synthetic snapshot is not a production backup.


### Migration integrity audit — 2026-11-21

- [x] Added an independent integrity auditor for source/normalized document count parity.
- [x] Verifies every keep/rename value, explicit default, approved drop count and status mapping.
- [x] Detects document order/collection identity mismatches and missing/changed values.
- [x] Integrated the audit as a mandatory success gate in the synthetic rehearsal.
- [x] Added standalone CLI `npm run audit:legacy-migration-integrity -- manifest.json source.json normalized.json`.
- [x] Added tests for count mismatch, changed values, defaults, status maps, nested data and timestamps.
- [ ] Confirm full tests and syntax checks in CI on the exact latest PR head.
- [ ] Database-level uniqueness and persistence checks remain reserved for a separately approved staging plan.

- [x] Integrity auditor now validates and requires a complete approved Migration Manifest before comparing source and output files.


### Firestore V1 calendar validation — 2026-11-21

- [x] Added a shared Gregorian calendar-date predicate to the isolated V1 Rules candidate.
- [x] Dream deadlines, movie release dates and restaurant visit dates now reject impossible dates (for example, February 30 and non-leap February 29).
- [x] Added Emulator cases for impossible dates, leap-day acceptance and empty optional dream deadlines.
- [ ] Run the Firestore Rules Emulator workflow on the exact updated branch head and review its compiler/runtime output.
- [ ] Keep this fixture isolated; production Rules remain the confirmed deny-all baseline until the owner provides the active project/rules export and the complete path inventory is approved.

- [x] Firestore V1 Rules candidate now rejects duplicate book genres/quotes, movie genre IDs and restaurant favorite dishes, matching the client/normalizer uniqueness contracts.

- [x] Reduced movie production-country list limit from 30 to 10 across client validation, migration normalizer and Firestore Rules to keep the Rules evaluator within its expression budget; added regression tests.


### Firestore V1 security candidate verification — 2026-11-21

- [x] Gregorian date validation: impossible dates rejected; leap days and documented empty optional dates covered.
- [x] List uniqueness checks aligned with client validators for books, movies and restaurants.
- [x] Core V1 collection read rules separated from the legacy read-only catch-all matcher.
- [x] Movie Rules expression budget brought under control by consolidating genre checks and bounding production countries to 10 across client, normalizer and Rules.
- [x] Root unit tests: **528/528 passed**.
- [x] Repository syntax checks: **passed**.
- [x] Firestore Rules Emulator: **13/13 passed**.
- [x] Auth + Firestore candidate emulator workflow: **14/14 rule tests and 59/59 server emulator tests passed**.
- [ ] Review the 53-commit divergence from `main` and prepare a deliberate integration plan; PR #1 is not mergeable yet.
- [ ] Obtain/export the actual active production Firestore rules and validate the complete live path inventory before any deployment.


### Production Firestore readiness audit — 2026-11-21

- [x] Audited direct Firestore operations in auth, personal collection, friends, notifications and legacy chat services.
- [x] Audited exported callable Functions and document triggers in `server/index.js`.
- [x] Added `docs/PRODUCTION_FIRESTORE_READINESS_AUDIT.md` with observed path inventory, P0/P1 blockers and production release gates.
- [ ] Replace legacy client registration and global username queries with verified V2 callable flow.
- [ ] Complete Chat V2 UI cutover and legacy history migration plan; remove browser writes to both participants' chat indexes.
- [ ] Complete A/B/guest Emulator and staging QA for all five personal collections, friendship, notifications and public profiles.
- [ ] Obtain production Rules export + project/database confirmation; build and manually approve a single complete production Ruleset.
- [ ] Verify browser App Check, backup restore and rollback before production rollout.
- **Production status: NOT READY. Existing deny-all Rules must remain unchanged until all release gates are satisfied.**

### Exact-head CI evidence gate — 2026-11-22

- [x] Reviewed current PR #1 head: `c8b501dafee72d446cca6a19b1b8a104d0da1723` (`test(chat): assert loaded pilot history rather than loading snapshot`). The commit changes only `tests/chat-v2-pilot-conversation.test.js` and strengthens assertions to inspect the loaded ready snapshot rather than assuming the first emitted snapshot already contains history.
- [x] Confirmed PR #1 remains open and GitHub reports `mergeable: false`; no rebase, force-push or merge was attempted.
- [x] Queried commit-associated workflow runs and combined commit statuses for this exact HEAD; both returned no records. This is **unverified**, not a pass or a failure.
- [x] Preserved the earlier documented 528/528 root tests, syntax checks, 13/13 collection Rules tests and 14/14 + 59/59 Auth/Firestore Emulator results as historical evidence only.
- [ ] Re-run root tests and syntax checks on exact HEAD `c8b501d`.
- [ ] Re-run the complete Firestore Rules Emulator workflow on exact HEAD and retain the run URL plus job output.
- [ ] Re-run the Auth + Firestore candidate Emulator workflow on exact HEAD and retain the run URL plus job output.
- [ ] Only after exact-head checks pass, proceed with the next bounded Chat V2 client-integration task. Production Rules, App Check, data and `main` remain untouched.
- **Gate status:** candidate implementation is progressing; exact-head CI evidence is pending. Do not mark the Emulator/CI gate complete from historical results.

### CI evidence correction — 2026-11-22

- The previous section's reference to `c8b501d` described an earlier checkpoint and is superseded by this entry.
- Current branch HEAD at the time of this update: `7931c30981e138ab82a87dc47fd20f7799a71dd3`.
- GitHub Actions runs associated with that exact HEAD:
  - Checks: [run 44990080876](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44990080876), status reported `in_progress`; job `test` was still executing `npm test`, with syntax check pending.
  - Firestore Rules Emulator: [run 44990080981](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44990080981), status reported `in_progress`; job was still executing the preliminary root `npm test`, so the Rules Emulator command had not started.
- No pass/fail conclusion is inferred from an in-progress run. These records must be checked again against the then-current HEAD before accepting any gate.
- PR #1 remains open; GitHub reports `mergeable: false` / `dirty`. No rebase, force-push or merge was attempted.
- Chat V2 remains candidate-only; the active app still registers legacy `ChatModule`. No UI cutover, Firebase deployment, production Rules change, or user-data migration was performed.
- **Gate status: HOLD.** Next action is to obtain a completed exact-HEAD CI run, then separately plan PR integration and Chat V2 staging.
