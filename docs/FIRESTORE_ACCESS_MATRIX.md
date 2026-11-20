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
| `users/{uid}/notifications/{id}` | Owner | Server | Owner — только `read` и допустимый read-state; Server — создание | Owner — только если UX поддерживает удаление | Текущий клиентский `addNotification(userId, data)` позволяет передавать произвольный адресат/данные; клиентское создание отключить |
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
| `friends.service.js` | Транзакция создаёт/удаляет документы сразу в двух user деревьях; lookup делает query users | Перевести дружбу и поиск на callable / publicProfiles; не открывать cross-user writes общим правилом |
| `notifications.service.js` | Клиент создаёт уведомление в произвольном `users/{userId}`; подписка читает своё; update меняет read | Создание — Server only. Клиенту оставить ограниченное изменение read-state и чтение своего списка |
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
- [ ] Решить, какие уведомления могут создаваться только сервером; текущий общий клиентский `addNotification` недостаточно безопасен.
- [ ] Перевести friendship writes на серверный протокол.
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
