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
- [ ] Уведомления и управление частотой/типами событий.

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
- [ ] Client-side notification creation remains a separate security blocker; `notifications.service.js` still accepts an arbitrary target UID and payload.


### Notification client-write removal — 2026-11-21

- [x] Removed the generic browser-side notification creation API that accepted an arbitrary recipient UID and arbitrary payload.
- [x] Bound notification subscription and read-state mutations to the active Firebase Auth UID; stale snapshots are ignored after account changes.
- [x] Added notification document-ID validation and regression tests in `tests/notifications-service-security.test.js`.
- [ ] Implement trusted server-generated notifications for verified friendship, message and achievement events; do not restore a generic client-selected recipient API.
- [ ] Add and verify the complete production Firestore Rules for notification reads and owner-only read-state updates.
- [ ] Run the notification flow in staging with two independent accounts and App Check.
- **Status:** the arbitrary client notification-write path is removed from the candidate client. The V1.0 notification feature is not complete until trusted event generation and Rules/staging acceptance are verified.


### Trusted friendship notifications — 2026-11-21

- [x] `mutateFriendshipV2` now creates a fixed-schema `friend_request` notification in the recipient's own notification subcollection in the same Admin SDK transaction as the paired request records.
- [x] Accepting a valid incoming request creates a fixed-schema `friend_accepted` notification for the original sender in the same transaction as the symmetric friendship records and request deletion.
- [x] Recipient, actor, message text, icon, color, route, read state and timestamp are derived by server code; no client notification payload is accepted.
- [x] Notification IDs are deterministic per actor/event type, so callable retries cannot create an unbounded series of duplicate notification documents.
- [x] Extended friendship transaction tests to assert exact notification recipient, schema and transaction write.
- [ ] Add trusted notification generation for V1.0 message and achievement events after their event contracts are verified.
- [ ] Complete notification Rules Emulator tests and two-account staging validation.
- **Status:** friend-request and friend-accepted notification writes are implemented in the candidate server transaction; CI and staging are not yet verified.
