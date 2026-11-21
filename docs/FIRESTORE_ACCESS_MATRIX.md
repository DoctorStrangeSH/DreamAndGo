# Матрица доступа Firestore — Dream&Go V1.0

**Статус:** архитектурная спецификация для production Rules; не является готовым файлом правил и не меняет Firebase Console.  
**Ветка аудита:** `refactor/security-foundation`  
**Проверено:** 2026-11-20.

## 1. Базовые инварианты

1. `users/{uid}` — приватный документ. Его может читать только владелец и доверенный серверный код. Правила Firestore не умеют скрывать отдельные поля документа.
2. Клиент не может назначать себе роль, менять доверенные счётчики, XP, достижения, состояние реестра никнеймов, прогресс ежедневных заданий или серверные метаданные.
3. App Check дополняет Firebase Auth и проверку авторизации, но не заменяет их.
4. Любой клиентский путь с UID должен проверять `request.auth.uid == uid`; переданный клиентом UID не является доказательством личности.
5. Все неописанные ниже коллекции и операции по умолчанию запрещены.
6. Вызовы Cloud Functions с Admin SDK обходят Firestore Rules. Для них обязательны собственные проверки Auth, App Check (где предусмотрено), входных данных, владельца и бизнес-инвариантов.
7. Тестовые правила в `tests/firebase-emulator/` не являются production Rules. Не публиковать их как есть.

## 2. Матрица коллекций и операций

Обозначения: **Owner** — только владелец документа; **Server** — доверенный Admin SDK / callable / trigger; **Participant** — участник конкретного ресурса; **Public** — только явно разрешённая публичная проекция; **Deny** — запрещено.

| Firestore path | Read | Create | Update | Delete | Основание / ограничения |
|---|---|---|---|---|---|
| `users/{uid}` | Owner; Server | Server (регистрация V2); legacy client signup — временно несовместим | Owner — только профильные поля из allowlist; Server — доверенные поля | Deny (удаление аккаунта — отдельный серверный lifecycle) | Email, настройки, приватные поля, stats и достижения не должны раскрываться другим пользователям |
| `users/{uid}/dreams/{id}` | Owner | Owner | Owner, схема + неизменяемые поля | Owner | Владелец может читать и редактировать личные мечты; публикация мечты не даёт права читать весь приватный документ |
| `users/{uid}/travels/{id}` | Owner | Owner | Owner, схема + неизменяемые поля | Owner | Личная коллекция; серверный XP trigger только реагирует на валидное событие |
| `users/{uid}/restaurants/{id}` | Owner | Owner | Owner, схема + неизменяемые поля | Owner | Личная коллекция |
| `users/{uid}/movies/{id}` | Owner | Owner | Owner, схема + неизменяемые поля | Owner | Личная коллекция |
| `users/{uid}/books/{id}` | Owner | Owner | Owner, схема + неизменяемые поля | Owner | Личная коллекция |
| `users/{uid}/friends/{friendUid}` | Owner | Server (предпочтительно) | Server | Server | Две стороны дружбы должны изменяться атомарно; не доверять клиенту запись в чужой профиль |
| `users/{uid}/friendRequests/{fromUid}` | Получатель-владелец | Server | Server (accept/decline) | Server | Отправитель не может создавать запрос от чужого имени; согласованность с sentRequests |
| `users/{uid}/sentRequests/{toUid}` | Отправитель-владелец | Server | Server | Server | Парная запись к входящему запросу |
| `users/{uid}/blockedUsers/{blockedUid}` | Owner / Server | Server (пока нет безопасного клиентского протокола) | Server | Server | Блокировка проверяется сервером при создании диалога |
| `users/{uid}/notifications/{id}` | Owner | Server event transaction only | Owner — только `read` и допустимый read-state; Server — создание | Owner — только если UX поддерживает удаление | Friend request/accept, achievement и private-message events создаются доверенными server transactions с фиксированным payload; Rules/staging проверки открыты |
| `users/{uid}/chats/{partnerUid}` (legacy index) | Owner | Server / временно только после миграции | Server | Server | Нельзя доверять клиенту запись unread, preview или metadata в чужой индекс |
| `chats/{chatId}/messages/{messageId}` (legacy chat) | Participant | Server | Server; авторское редактирование/удаление — только через проверенный серверный протокол | Server | Текущий legacy client пишет сообщения и обе стороны индекса; прямой доступ не открывать без отдельной модели и правил |
| `chats/{chatId}` (Chat V2) | Participant через callable; прямой клиентский доступ — Deny | Server | Server | Server | `createPrivateChatV2` создаёт чат и pair в транзакции |
| `chats/{chatId}/messages/{messageId}` (Chat V2) | Participant через callable; прямой клиентский доступ — Deny | Server | Server | Server | Send/status/read/unread/history endpoints выполняют серверную проверку участников |
| `chatPairs/{pairKey}` | Server | Server | Server | Server | Дедупликация пары пользователей; клиенту недоступно |
| `publicProfiles/{uid}` | Public (только allowlist) | Server migration/registration | Server | Server | Не содержит email, настроек, токенов, приватных связей или служебных полей |
| `usernameReservations/{normalized}`, `system/usernameRegistry` | Server | Server | Server | Server | Реестр и состояние регистрации — только сервер; registry не включать до backup, dry-run и аудита |
| `serverXp/{uid}/**`, `serverDailyTasks/{uid}/**` | Server; пользовательский snapshot через callable | Server | Server | Server | XP, события, дневные лимиты, задания и claims — серверная истина |
| `users/{uid}.stats`, `users/{uid}.achievements` | Owner | Server | Server | Server | Клиент получает результат callable, но не назначает себе счётчики/награды |
| `server*`, `migration*`, `system*`, `chatPairs/**` | Server | Server | Server | Server | Служебные данные и журналы миграции |
| Неизвестные коллекции / пути | Deny | Deny | Deny | Deny | Fail closed |

**Важное уточнение:** правила Firestore не могут надёжно обеспечить «разрешить владельцу менять только несколько полей» простым чтением UI. Для каждого owner-update нужен `diff().affectedKeys().hasOnly([...])`, проверка типов/размеров/enum, защита неизменяемых полей и временных меток. Для полей, которые одновременно пишет сервер и клиент, нужно разделить команды или отдельные документы.

## 3. Подтверждённые операции клиента и несовместимости

| Сервис / файл | Наблюдаемая операция | Решение для Rules |
|---|---|---|
| `auth.service.js` | Legacy query по `users.username/usernameNormalized`; создание профиля и `_init`; обновление `lastLogin` | Legacy поиск по приватным users отключить после перехода на public profile / callable. Регистрация V2 — Server. Не разрешать произвольный create/update профиля |
| `dreams/travel/book/movie/restaurant.service.js` | CRUD в собственной подколлекции пользователя; фильтры по статусу/категории/кухне | Owner CRUD только по конкретной схеме; проверить все поля на create и update |
| `friends.service.js` / `friendship-callable.service.js` | Читает только собственные списки; send/accept/reject/cancel/remove вызывают `mutateFriendshipV2` | Все изменения дружбы — Server only через Auth + App Check callable; UID берётся из Auth, парные записи проверяются и изменяются одной Admin SDK транзакцией. Двухаккаунтный staging-прогон обязателен |
| `notifications.service.js` | Подписка читает собственный список; update меняет read. Клиентское создание удалено | Создание — только доверенные server event transactions; клиенту оставить ограниченное изменение read-state и чтение собственного списка |
| `chat.service.js` | Legacy client пишет messages и оба chat indexes, редактирует/удаляет сообщения | Не пытаться чинить общими правилами. Сначала cutover на серверный Chat V2 и подтверждённая миграция истории |
| `profile-stats.service.js`, `daily-tasks.service.js` | Callable refresh/claim с UID из Auth; клиент не отправляет счётчики | Служебные документы закрыты от клиента; endpoint сам проверяет Auth и App Check |
| `achievements.service.js`, `level.service.js` | Читают собственный users profile | Owner read; запись наград — Server only |
| `export.service.js`, `search.service.js` | Читают собственный профиль и подколлекции | Owner read; search не должен становиться глобальным поиском приватных документов |
| `server/index.js` | Callable и document triggers для чата, профиля, XP и daily tasks | Проверять каждую функцию отдельно: Auth, App Check, вход, принадлежность и лимиты. Admin SDK не защищён Firestore Rules |

## 4. Тестовая матрица Emulator — обязательный минимум

Для каждого теста создать два независимых аккаунта A и B, плюс unauthenticated context.

### Приватный профиль и личные коллекции
- [ ] Гость не читает `users/A` и любые приватные подколлекции.
- [ ] A читает и изменяет разрешённые поля `users/A`.
- [ ] A не читает и не изменяет `users/B`.
- [ ] A не может изменить `email`, `role`, `permissions`, `stats`, XP, achievements или server-owned timestamps.
- [ ] A может CRUD свои документы каждой из пяти коллекций только с валидной схемой.
- [ ] A не может создать документ с неизвестными полями, неверными типами, чрезмерными строками, подменённым UID или чужими timestamps.
- [ ] A не читает закрытую мечту B даже по известному document ID.
- [ ] Публичная мечта, если она остаётся в V1.0, читается только через отдельную безопасную проекцию; не открывать родительскую приватную коллекцию.

### Социальные данные и уведомления
- [ ] A не создаёт запрос дружбы от имени B и не меняет B/friends.
- [ ] Нельзя создать одностороннюю или противоречивую пару friendRequests/sentRequests/friends.
- [ ] Только адресат принимает/отклоняет входящий запрос.
- [ ] A не может создать уведомление для B, подменить sender/type/link или прочитать чужие уведомления.
- [ ] A может менять только разрешённый read-state собственного уведомления.

### Чат
- [ ] Гость и посторонний C не читают метаданные чата и сообщения A/B.
- [ ] Участник может получить только собственные разрешённые данные чата.
- [ ] A не отправляет сообщение от имени B, не меняет чужое сообщение и не подменяет участников.
- [ ] Клиент не меняет unread/lastMessage/lastMessageTime другого участника.
- [ ] Legacy и V2 пути тестируются раздельно; V2 Admin SDK endpoints проверяются отдельными server/emulator тестами.
- [ ] Удаление диалога не теряет историю из-за гонки с новой отправкой.

### Серверные награды и миграции
- [ ] Клиент не создаёт/обновляет serverXp, serverDailyTasks, usernameReservations, system registry и migration journal.
- [ ] Повторный callable/trigger не дублирует XP, achievement или claim.
- [ ] Пользователь A не может запросить статус/награду для UID B.
- [ ] App Check enforced endpoints отклоняют отсутствующий/невалидный App Check token.
- [ ] Миграционные скрипты по умолчанию read-only; apply требует явного флага и backup/review gate.

## 5. План внедрения — без риска для существующих пользователей

1. Снять и зафиксировать read-only копию **реальных опубликованных** Rules и Firebase config через Firebase Console / административный канал. Текущий репозиторий не содержит достоверных production Rules.
2. Согласовать schema inventory по реальным данным без копирования PII в репозиторий.
3. Сначала закрыть серверные операции, которые сейчас подделываются клиентом: notifications, friendship, registration/username, legacy chat, server-owned counters.
4. Написать полный production Rules файл с deny-by-default и подключить его только к отдельному Emulator config.
5. Прогнать полный набор правил и серверных тестов; добавить проверки реальных query patterns (Rules не фильтруют результаты запроса).
6. Провести staging rehearsal с двумя тестовыми аккаунтами и существующими тестовыми сценариями.
7. Согласовать backup, окно миграции, rollback и ручной deploy. Не менять production Rules автоматически из CI.
8. После выката проверить Auth, личные коллекции, поиск, друзей, уведомления, чат, export, XP и daily tasks двумя аккаунтами.

## 6. Открытые решения / релизные блокеры

- [ ] Получить актуальные production Rules и подтвердить, что аварийный deny-all действительно опубликован.
- [ ] Утвердить, сохраняется ли публичная мечта в V1.0 и через какую проекцию она доступна.
- [x] Зафиксировать серверное создание friend-request/friend-accepted, achievement и private-message notifications с фиксированным payload в доверенных серверных транзакциях. Notification Rules/staging проверки остаются открытыми.
- [x] Перевести friendship writes на `mutateFriendshipV2`: Auth UID, App Check, проверка получателя и атомарная транзакция для обеих сторон; браузерные записи удалены из `FriendsService`.
- [ ] Провести staging two-account проверку всех пяти операций и подтвердить App Check на реально развернутой callable.
- [ ] Определить момент и совместимость миграции legacy chat → Chat V2.
- [ ] Утвердить точные схемы всех пяти коллекций и profile update allowlist.
- [ ] Согласовать доступ к Storage, если V1.0 использует Firebase Storage.
- [ ] Прогнать Emulator и staging; вручную проверить rollback.

## 7. Что не делать

- Не публиковать `allow read, write: if true`, даже временно.
- Не публиковать `allow read, write: if request.auth != null` на всю базу.
- Не использовать только клиентскую проверку UID как authorization.
- Не разрешать `users` list/query ради поиска по никнейму.
- Не открывать клиенту server-owned коллекции.
- Не включать новые Rules в production до backup, emulator/staging тестов и ручного подтверждения владельца.


## 8. Схемы V1.0 и открытый вопрос публичности

Фактические поля, типы, enum, размеры, nested maps/lists, timestamp-поведение и расхождения legacy данных описаны отдельно в `docs/FIRESTORE_V1_DATA_SCHEMAS.md`.

Критичное наблюдение из текущих write services: `travels`, `books` и `restaurants` создаются с `isPublic: true`; `dreams` — с `isPublic: false`; `movies` не получают это поле при создании. До отдельного решения владельца эти флаги **не меняют** матрицу доступа: документы под `users/{uid}` остаются приватными для других пользователей. Публичный доступ возможен только через согласованную безопасную проекцию или callable API.


## 9. Public profile consent gate

- Public profile projection is disabled by default. The server and client projection helpers now require `users/{uid}.publicProfileEnabled === true`; missing or false values are treated as private.
- `getPublicProfileV2` returns a generic not-found response for profiles without explicit opt-in. Exact username search returns no public profile for those accounts.
- The public profile migration creates only opted-in profiles. Username collisions are still checked across all accounts (including private accounts) to prevent ambiguous handles.
- The current profile/settings UI has not yet been verified to expose a clear opt-in control. In addition, `FriendsService.getUserByUsername` still reads `users` directly from the browser instead of calling `findPublicProfileByUsernameV2`. Therefore **no account should be migrated or advertised as public until an owner-facing privacy setting, validation, Rules, and callable client cutover are implemented and tested**.
- This field is a security gate introduced in the candidate branch; it is not yet a production Rules permission or a completed UI setting.


## 10. Client profile-read cutover

- Friend search calls `findPublicProfileByUsernameV2`; friend/request/sent-request lists call `getPublicProfilesV2` in batches of at most 50 UIDs.
- The profile page may read `users/{uid}` directly only when `uid == request.auth.uid`. Other-account profile pages use the server-side allowlisted projection.
- The callable endpoints require Auth, App Check and the per-account lookup quota. Do not enable the client cutover in production until App Check enforcement and deployed Functions are verified.
- This code cutover does not itself enable public visibility. `publicProfileEnabled` remains explicit opt-in and missing/false means private.


## 11. Public profile visibility mutation

- Only `setPublicProfileVisibilityV2` may change `users/{uid}.publicProfileEnabled`; it derives UID from Firebase Auth and requires App Check.
- Browser clients must never write this field through generic profile settings updates.
- Opt-out is allowed immediately. Opt-in requires `system/usernameRegistry` to be ready with schema version 1 and completed legacy backfill, plus `usernameReservations/{usernameNormalized}.uid == request.auth.uid`.
- The callable updates only the caller's private profile and a server timestamp. Public projections remain allowlisted and are returned only by protected callables.


## 12. Consent flag is never client-writable or publicly projected

- Emulator regression tests deny owner browser attempts to create or update `publicProfileEnabled` with either boolean value.
- Only the authenticated, App-Check protected `setPublicProfileVisibilityV2` Admin SDK callable can mutate the flag.
- Public profile DTOs explicitly omit `publicProfileEnabled`; disclosure of consent metadata is not part of the public contract.


### Notification write ownership update — 2026-11-21

- Candidate client service no longer exposes any notification creation method.
- `mutateFriendshipV2` is an Auth + App Check protected server callable. Its Admin SDK transaction creates only the fixed-schema friend-request and friend-accepted notification records at paths derived from authenticated actor and validated target UIDs.
- Client read-state changes remain owner-scoped in the candidate service; actual authorization still depends on the not-yet-verified production Rules.
- Friend, achievement and private-message notification event sources are implemented in candidate server transactions. Do not enable a generic notification creation endpoint; dedicated Rules and staging verification remain open.


### Friendship notification lifecycle

The server transaction creates fixed-schema friend-request and friend-accepted notifications. It also removes the pending request notification when the request is cancelled, accepted or rejected. These writes are atomic with the corresponding friendship/request state changes. No browser API can choose a notification recipient or payload. Rules must still allow only the owner to read their notification collection and update only the approved read-state field. General Emulator suites passed (6 Rules tests and 59 server/Auth/Firestore tests on implementation HEAD), but they do not yet contain notification-specific read/update authorization cases; two-account staging remains open.


### Trusted achievement notification event

The candidate `refreshUserStatsV2` server flow writes a fixed-schema achievement notification to the authenticated owner's own notification collection only when a new achievement level is awarded by the server policy. Achievement state and its notification are written atomically. Stable IDs are keyed by achievement and level. The browser cannot select the recipient or payload. Owner-only read and read-state Rules still require Emulator and staging verification.


### Trusted private-message notification event

The candidate `sendPrivateMessageV2` server transaction writes a fixed-schema `message` notification to the other validated chat participant's own notification subcollection in the same transaction as the message and unread counter. The preview is bounded to 120 characters. Stable IDs are keyed by the server message document ID, so retries do not duplicate notices. Client notification creation remains prohibited. Dedicated owner-read/read-state Rules tests and staging validation are still required; the separate recovery Rules prototype remains read-only and is not the production Rules contract.


## Notification access verification — 2026-11-21

- [x] The isolated fixture `tests/firebase-emulator/notifications.rules` permits only owner reads, denies guest/cross-user access, denies client create/delete, and allows the owner to change only `read` from false to true.
- [x] Regression workflow passed: 7/7 isolated Firestore Rules tests and 59/59 server/Auth/Firestore Emulator tests ([run 44893915020](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44893915020)).
- [x] Root Checks passed on candidate HEAD `05961cb3bcec5f6fbe6b70e84f2b261c700e9237`: 461/461 tests and syntax checks for 254 JavaScript files ([run 44893947666](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44893947666)).
- [ ] Review the actual active production Rules and integrate this notification contract into the complete production Rules configuration. The candidate branch currently has no root `firestore.rules` or `firebase.json`; isolated fixture files are not deployable Rules.
- [ ] Run two-account staging validation with App Check before any production rollout.


## Repository configuration inventory — 2026-11-21

- [x] Checked the repository root on both `main` and `refactor/security-foundation`: neither branch contains a deployable root `firestore.rules` or `firebase.json`.
- [x] Confirmed `tests/firebase-emulator/firebase.json` points the emulator to `tests/firebase-emulator/chat.rules`; this is a test harness only. `notifications.rules`, `owner-read.rules` and `chat.rules` are isolated fixtures, each with a deny-by-default fallback and intentionally incomplete collection coverage.
- [ ] Obtain the actual active Firestore Rules and Firebase project configuration from the authorized Firebase Console / CLI read-only export. GitHub repository access cannot establish what is currently deployed.
- [ ] Compare the exported active Rules and indexes with this access matrix before drafting any production Rules candidate.
