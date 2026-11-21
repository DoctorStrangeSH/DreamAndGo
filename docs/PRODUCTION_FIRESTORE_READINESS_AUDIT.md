# Production Firestore Readiness Audit — DreamAndGo V1.0

**Дата:** 2026-11-21  
**Ветка:** `refactor/security-foundation`  
**Статус:** аудит кода и проектных контрактов; production rollout запрещён  
**Назначение:** единая контрольная точка перед заменой emergency deny-all Firestore Rules.

> Этот документ не является production Rules и не разрешает деплой. Emulator fixtures проверяют только изолированные кандидаты. По подтверждению владельца активная база `(default)` использует deny-all правила. Их нельзя заменять тестовым файлом или неполной матрицей.

## 1. Итог

- [x] Сверены основные клиентские Firestore-сервисы и обнаруженные операции.
- [x] Сверены экспортируемые callable Functions и document triggers в `server/index.js`.
- [x] Сопоставлены наблюдаемые пути с `FIRESTORE_ACCESS_MATRIX.md`.
- [x] Зафиксированы legacy пути, которые конфликтуют с целевой моделью Server-only.
- [x] Подтверждён CI-контракт кандидата: root 528/528, Firestore Rules Emulator 13/13, Auth+Firestore candidate 14/14 и server emulator 59/59 на проверенных коммитах.
- [ ] Получить timestamped экспорт фактически опубликованных production Rules и Firebase config из Console.
- [ ] Проверить все используемые Firestore query patterns на реальном Emulator с двумя аккаунтами и гостем.
- [ ] Завершить клиентский cutover регистрации, чата и остальных legacy путей.
- [ ] Проверить App Check на staging с настоящим браузерным SDK.
- [ ] Подтвердить backup и восстановление; провести dry-run миграций.
- [ ] Подготовить, проверить и отдельно утвердить production Rules.
- [ ] Провести ручной deploy и post-deploy smoke tests. CI никогда не деплоит production Rules автоматически.

## 2. Наблюдаемые клиентские пути

| Сервис | Наблюдаемые Firestore пути / операции | Вывод для V1.0 |
|---|---|---|
| `auth.service.js` | `users` list/query по `usernameNormalized` и `username`; прямые `setDoc(users/{uid})`; запись `_init` в подколлекции; `lastLogin` merge; чтение своего профиля | **BLOCKER.** Legacy signup и nickname lookup должны быть отключены после проверенного перехода на callable. Не разрешать глобальный users query. Убрать клиентские init-документы и lastLogin write либо определить безопасный серверный контракт. |
| `dreams.service.js` | Owner CRUD: `users/{uid}/dreams/{id}`; query с orderBy/status/category | Candidate schema и Rules есть; проверить create/update/delete и запросы по реальным данным. |
| `travel.service.js` | Owner CRUD: `users/{uid}/travels/{id}`; query по createdAt/status | Candidate schema и Rules есть; проверить три операции и XP trigger. |
| `book.service.js` | Owner CRUD: `users/{uid}/books/{id}`; query по createdAt/status | Candidate schema и Rules есть; проверить три операции и XP trigger. |
| `movie.service.js` | Owner CRUD: `users/{uid}/movies/{id}`; query по createdAt/status | Candidate schema и Rules есть; проверить create/update/delete и XP trigger. |
| `restaurant.service.js` | Owner CRUD: `users/{uid}/restaurants/{id}`; query по createdAt/cuisine/status | Candidate schema и Rules есть; проверить три операции и XP trigger. |
| `friends.service.js` | Читает `friends`, `friendRequests`, `sentRequests` текущего UID; изменения вызывает `mutateFriendshipV2`; профили получает через callable | Запись переведена на сервер. Read должен быть owner-only и проверен на A/B/guest; проверить пустые коллекции и отсутствие `_init` в реальных данных. |
| `notifications.service.js` | Owner subscription/read: `users/{uid}/notifications`; update только `read: true` | Rules должны разрешать только owner read и узкий read-state update; запрещать клиентский create и изменение payload/recipient/type. |
| `chat.service.js` | Legacy `users/{uid}/chats/{partnerUid}`; `chats/{chatId}/messages/{id}`; client batch writes, edits/deletes, unread updates и удаление индексов обоих пользователей | **BLOCKER.** Не открывать эти операции общими Rules. Завершить Chat V2 UI cutover, миграцию истории и lifecycle удаления/архивации. |
| `achievements.service.js`, `level.service.js` | Читают `users/{uid}` | Только чтение своего профиля; клиент не может менять XP, stats, level и achievements. |

### Важные детали legacy signup

В `auth.service.js` альтернативный `signUpWithEmailV2` уже вызывает `registerProfileV2`, но rollout-флаги в приложении остаются выключенными. Обычная форма всё ещё использует legacy путь. Поэтому callable-реализация сама по себе не означает, что регистрация безопасно переключена.

До переключения требуется:
1. подтверждённый реестр и backfill существующих username;
2. registration freeze на время backfill;
3. подтверждённый backup и restore rehearsal;
4. проверка App Check и callable на staging;
5. проверка восстановления Auth-only аккаунта после сетевого сбоя;
6. явный переключатель клиента и тесты повторного входа.

## 3. Серверные операции и доверенные пути

В `server/index.js` обнаружены следующие группы:

| Экспорт / группа | Назначение | Обязательные проверки перед rollout |
|---|---|---|
| `registerProfileV2`, `getRegistrationStateV2` | Регистрация и восстановление профиля | Auth UID, App Check, registry-ready gate, reservation transaction, retry/recovery, конкурентные username |
| `getPublicProfileV2`, `findPublicProfileByUsernameV2`, `getPublicProfilesV2`, `setPublicProfileVisibilityV2` | Публичные проекции и согласие | Auth, App Check, opt-in, quota, allowlisted DTO, приватные аккаунты не раскрываются |
| `mutateFriendshipV2` | Заявки и дружба | Auth UID, App Check, допустимый action, атомарность парных записей, блокировки, уведомления |
| `createPrivateChatV2`, `sendPrivateMessageV2`, `getPrivateMessageStatusV2`, `markPrivateMessageReadV2`, `getPrivateChatUnreadV2`, `getPrivateChatHistoryV2` | Chat V2 | Auth, App Check, membership, active state, блокировки, идемпотентность, bounded history, rate limits |
| `refreshUserStatsV2` | Пересчёт личной статистики | UID только из Auth; сервер сам считает документы |
| `getDailyTasksV2`, `claimDailyTaskRewardV2`, `claimDailyTaskBonusV2` | Ежедневные задания и награды | Auth, App Check, server-owned progress, идемпотентность и лимиты |
| `award*XpV2`, `awardDreamCompletionXpV2` | Document triggers XP | Валидный переход/документ, стабильный event ID, защита от повторов и farming |

Admin SDK обходит Firestore Rules. Поэтому тесты Security Rules не заменяют тесты авторизации и бизнес-логики каждой callable/trigger. Для каждой экспортируемой функции требуется отдельная проверка negative cases: guest, подмена UID, чужой ресурс, malformed payload, повтор запроса, отсутствие/невалидный App Check там, где он обязателен.

## 4. Критические несовпадения и решения

### P0 — закрыть до любого production Rules rollout

1. **Legacy registration:** клиент ещё пишет профиль напрямую и ищет username через collection query. Не открывать эти права в Rules. Завершить V2 cutover и проверить восстановление.
2. **Legacy chat:** клиент пишет сообщения и индексы двух участников. Не разрешать это через общий authenticated access. Переключить UI на Chat V2, подтвердить перенос/совместимость истории и поведение удаления.
3. **Полный inventory профиля:** `users/{uid}` содержит одновременно приватные поля и серверные метрики. Rules должны использовать точный allowlist для клиентских обновлений; нельзя разрешать произвольный merge.
4. **Server-owned collections:** закрыть клиентский доступ к `chatPairs`, `usernameReservations`, `system/usernameRegistry`, `profileLookupQuotas`, `serverXp`, `serverDailyTasks`, migration journals и другим служебным путям.
5. **Notification writes:** клиент не создаёт уведомления. Разрешить только узкое обновление read-state владельцем; создание и payload — доверенному серверу.
6. **Rules и реальный database ID:** тестовый файл не должен случайно попасть в production. Сверить project ID, database ID и опубликованную версию правил.

### P1 — закрыть до публичного релиза

- A/B/guest тесты пяти личных коллекций и всех query variants.
- A/B тесты friendship read и callable mutations.
- Public profile opt-in/out, приватные профили и поиск username.
- App Check с реальным browser SDK; negative test без токена и quota test.
- Проверка удаления аккаунта, orphan records, retention и rollback.
- Проверка export/search и всех оставшихся прямых Firestore reads.
- Мониторинг ошибок callable, Rules denials, квот и триггеров после staging rollout.

## 5. Публичные профили

Публичный профиль должен быть отдельной проекцией `publicProfiles/{uid}`, не прямым чтением приватного `users/{uid}`. Публичная выдача должна содержать только allowlisted DTO. `publicProfileEnabled` — явное согласие пользователя; отсутствие или false означает private. Поле согласия не должно изменяться generic profile update и не должно возвращаться в публичном DTO.

До включения публичного поиска проверить:
- opt-in и opt-out;
- отсутствие email, приватных настроек, friend lists и server-owned fields;
- username collision policy с приватными аккаунтами;
- rate limit и App Check;
- приватный пользователь не обнаруживается через публичный поиск, если это не разрешено спецификацией.

## 6. Production Rules: запрет на преждевременный deploy

Текущий production baseline по подтверждению владельца — deny-all для Firestore. Это безопасно, но приложение с прямыми клиентскими запросами не будет полноценно работать, пока Rules остаются закрытыми.

При этом нельзя использовать тестовый `collections-v1.rules` как готовый production файл: он покрывает только часть схем и путей. Отдельные fixture Rules для owner-read, chat, notifications и Auth journeys — это изолированные тестовые контракты, а не единый production policy.

Перед подготовкой production файла:
1. Получить read-only экспорт текущих опубликованных Rules.
2. Зафиксировать Firebase project ID и database ID; не полагаться на имя default database.
3. Сверить каждую строку раздела 2 с матрицей доступа и фактическим query pattern.
4. Составить единый Rules файл с deny-by-default и только согласованными match blocks.
5. Прогнать все положительные и отрицательные Emulator tests.
6. Проверить правила на двух тестовых аккаунтах в staging.
7. Сохранить backup текущего ruleset и rollback инструкцию.
8. Получить отдельное явное подтверждение владельца перед ручной публикацией.

**Storage не входит в V1.0:** владелец подтвердил, что Storage не подключён и платный апгрейд не планируется. Не добавлять Storage uploads и attachment paths в критерии приёмки.

## 7. Release gate

Релиз Firestore V1.0 разрешается только если все пункты отмечены:

- [ ] Production Rules export сохранён и сопоставлен с проектом/database.
- [ ] Legacy signup/query выключен; V2 registration и recovery проверены в staging.
- [ ] Legacy chat больше не пишет в Firestore из браузера; Chat V2 прошёл migration/read/write/delete QA.
- [ ] Все пять личных коллекций проходят A/B/guest CRUD и query tests.
- [ ] Friends, notifications, public profiles и profile visibility проходят A/B/guest tests.
- [ ] Все callable endpoints прошли Auth/App Check/authorization/validation/idempotency negative tests.
- [ ] Server triggers проверены на повторную доставку и невалидные события.
- [ ] Backup restore и rollback подтверждены.
- [ ] Production Rules diff прошёл review; deploy только вручную после подтверждения владельца.
- [ ] Post-deploy smoke tests завершены; мониторинг не показывает массовых permission-denied или ошибок функций.

## 8. Текущий вывод

**Статус: NOT READY FOR PRODUCTION.** Кандидатные unit и Emulator suites зелёные, но интеграционные блокеры остаются: legacy registration, legacy chat, отсутствие подтверждённого production Rules export, неполный staging App Check и незавершённый полный A/B/guest QA.

Следующий технический шаг — не расширять доступ в Rules, а закончить client cutover регистрации и Chat V2, затем добавить сквозные A/B/guest tests по этой матрице. До этого production deny-all не менять.


## 9. Дополнительная проверка Chat V2 UI — 2026-11-21

В репозитории уже есть отдельные клиентские building blocks Chat V2: `ChatV2Session`, callable transport/invoker, history controller, pilot conversation/view, encrypted pending-intent adapter и deny-by-default allowlist feature gate. Их unit/integration harness покрывает историю, отправку, read receipts, восстановление pending intents, смену аккаунта и отзыв feature gate.

Однако фактический `js/modules/chat/chat.js` по-прежнему импортирует и использует legacy `ChatService`; он вызывает legacy create/send/edit/delete/read/delete-chat методы и подписывается на legacy realtime snapshots. `js/app.js` не подключает Chat V2 pilot gate/session. Следовательно, наличие V2 transport и pilot UI не является клиентским cutover и не снимает P0 blocker.

**Безопасный следующий порядок Chat V2:**
1. Не менять legacy UI/production Rules до staging backend и backup.
2. Сверить все функции Chat V2 с протоколом блокировок, лимитов, membership и lifecycle; отдельно закрыть незавершённую политику блокировок/лимитов для create/send.
3. Подготовить импорт/экспорт истории и reconciliation отчёт; миграция только после backup и read-only audit реальных документов.
4. Включить V2 только через динамический feature gate с allowlist и backendReady; проверить отзыв доступа и переключение аккаунта.
5. Прогнать два реальных тестовых аккаунта на staging: create, send, retry/idempotency, history pagination, read receipt, block, delete/archive, reconnect и logout.
6. Только после canary подтвердить выключение legacy writes и расширять rollout.

## 10. CI повторно проверен после добавления production readiness audit

На актуальном документальном HEAD `b6815cbb3a915b5d00389ecc975ff27ae3af9b90` GitHub Actions завершил успешно:
- `Checks`: success.
- `Firestore Rules Emulator`: success — root 528/528, Rules Emulator 13/13.

Ранее проверенный Auth+Firestore candidate workflow также завершился успешно: 14/14 Rules/Auth journey cases и 59/59 server emulator tests. CI подтверждает кандидатный код и тестовые fixtures, но не production deploy.


### App Check code audit clarification — 2026-11-21

The earlier wording that implied App Check was not initialized in the browser was too broad. The repository already initializes App Check in `js/config/firebase.js` through `initializeWebAppCheck`, using `ReCaptchaEnterpriseProvider` and token auto-refresh. The public site key is present in the client config, and inspected callable endpoints declare `enforceAppCheck: true`.

What remains unverified is the external/runtime configuration: Firebase Console app registration and enforcement settings, allowed production/staging domains, actual token issuance in a browser, successful callable with a valid token, rejection without a token, and quota behavior. The corrected status is **client bootstrap implemented; staging/Console verification pending**, not “App Check absent”. See `docs/APP_CHECK_ROLLOUT.md`.


## 11. Chat V2 read receipt UI wiring — 2026-11-21

The isolated Chat V2 pilot now connects incoming unread message DOM nodes to the existing IntersectionObserver receipt tracker. The view exposes only validated unread incoming message elements; the conversation rebinds observers after each history render, and closes the tracker on dispose. ChatV2Session now removes stopped trackers from its active tracker set. Focused tests cover the integration and lifecycle cleanup.

This is **candidate pilot-only**. `js/modules/chat/chat.js` remains legacy and still uses ChatService/RealtimeService. Do not enable the pilot in the main app until backend deployment, dynamic allowlist configuration, real browser App Check, two-account staging, migration and rollback checks are complete. Sender-side read-status refresh and real browser IntersectionObserver verification remain open.


### Sender delivery/read receipt rendering — 2026-11-21

The candidate pilot conversation now correlates local ChatDeliveryController records to server history using the exact server message ID. It decorates only matching outgoing rows, then polls the authenticated sender-only status endpoint for those tracked outgoing messages. A `read` indicator is rendered only after a response confirms the same message ID and `read === true`; unknown/offline results do not change the indicator. Focused tests cover the path. This remains pilot-only and does not modify the legacy ChatModule.
