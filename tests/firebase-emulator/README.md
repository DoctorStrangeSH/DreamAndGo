# Изолированные тесты Firestore для будущей модели чатов

> **Только тестовый стенд.** `chat.rules` — намеренно неполный набор правил: он блокирует все остальные коллекции DreamAndGo. **Не переносить в корневой `firestore.rules`, не выполнять `firebase deploy`.** Действующие правила Firebase пока не экспортированы, миграция существующих переписок не выполнена.

## Запуск локально

Нужны Node.js, Java и Firebase CLI. Из корня репозитория:

```bash
npm --prefix tests/firebase-emulator install
npx firebase-tools emulators:exec --project demo-dreamandgo-chat-rules --only firestore --config tests/firebase-emulator/firebase.json "npm --prefix tests/firebase-emulator test"
```

Используется лишь эмулятор на `127.0.0.1:8086`; никакой Firebase Console не меняется. При ошибке поиска rules-файла в некоторых версиях CLI запусти команду из папки `tests/firebase-emulator` с `--config firebase.json`.

## Что проверяется

- Гость и посторонний пользователь не читают чат и сообщения.
- Посторонний не пишет сообщения, даже зная ID диалога.
- Участник не может выдать себя за другого отправителя.
- Ограничение длины сообщения и запрет пустого текста.
- Участники не могут самостоятельно менять состав чата.
- Один участник не может редактировать или удалять сообщение другого.
- После перехода чата в `deleting` новые сообщения отклоняются.

Тестовый документ `chats/room-1` создаётся через привилегированный emulator context для имитации доверенного backend. **В реальном приложении такого backend пока нет**. Эти тесты не проверяют существующую production-схему `getChatId(...).join('_')`, сохранение истории, счётчики непрочитанных или серверное удаление. Перед внедрением правил нужны backend, миграция и интеграционные тесты всех коллекций.


## Дополнительная проверка read-only recovery prototype

`owner-read.rules.test.mjs` дополнительно подтверждает, что:
- владелец не получает право записи в friends, friendRequests, sentRequests, chats, notifications и dailyTasks только потому, что документ лежит в его дереве;
- клиент не читает и не меняет `serverXp`, `serverDailyTasks`, `system/usernameRegistry`, `usernameReservations`, `chatPairs`, `publicProfiles` и `chats`;
- recovery prototype остаётся read-only для личных коллекций, кроме явно валидированной схемы мечты и ограниченного набора полей профиля.

Это negative-test coverage для ограниченного recovery режима, не утверждение о готовности production Rules.


## Изолированный notification Rules candidate

`notifications.rules` проверяет отдельный минимальный контракт уведомлений: владелец может читать только собственную коллекцию; гость и другой пользователь не имеют доступа; клиент не может создавать или удалять уведомления; владелец может только перевести `read` из `false` в `true`, не меняя payload. Тесты запускаются общей командой Emulator workflow.

Это отдельный fixture для тестирования матрицы доступа, а не готовый production Rules файл. Он не разрешает остальные коллекции и не должен деплоиться.


## Isolated V1 travel Rules candidate

- `collections-v1.rules` adds a schema-specific owner CRUD candidate for `users/{uid}/travels/{travelId}`, while retaining the recovery fixture's existing restricted profile/dream behavior and denying unrelated generic collection writes.
- `collections-v1.rules.test.mjs` covers owner create/read/list/update/delete, guest and second-account isolation, unknown fields, invalid nested budget maps/currency/ranges, rating bounds, HTTPS photo URLs/list limits and server timestamp enforcement.
- The test is included in the Emulator package script.
- **Important:** this is a staged candidate for the travel collection only, not a complete V1.0 Rules file and not production configuration. Books, movies and restaurants remain write-denied by the generic fallback. Do not deploy or copy this fixture to Firebase Console.


## Isolated V1 books Rules candidate

- The same `collections-v1.rules` fixture now includes an explicit owner CRUD matcher for `users/{uid}/books/{bookId}`.
- The candidate enforces the book field allowlist, required title/author/status/notes/timestamps, status and genre allowlists, year/page/rating bounds, `currentPage <= totalPages`, review/quote limits and immutable/server timestamps.
- `books-v1.rules.test.mjs` covers owner CRUD, guest and second-account isolation, unknown fields, invalid enums/genres, page overflow, numeric bounds, quote bounds and timestamp forgery.
- The test is included in the Emulator package script. This remains a test-only staged candidate, not production Rules.


## Isolated V1 movies Rules candidate

- `collections-v1.rules` now includes an explicit owner-only CRUD matcher for `users/{uid}/movies/{movieId}`.
- The schema checks the TMDB movie ID, title/status/notes, optional metadata lengths, HTTPS poster/backdrop URLs (or null when artwork is absent), rating/count/runtime/budget bounds, allowed genre IDs, bounded production-country maps and timestamp integrity.
- `movies-v1.rules.test.mjs` covers owner CRUD, guest/second-account isolation, unknown fields, invalid IDs/status/genres/countries, list bounds, non-HTTPS artwork, invalid date shape, rating/budget bounds and forged timestamps.
- The movie Rules test is included in the Emulator package script. This is still a test-only candidate, not production Rules.
