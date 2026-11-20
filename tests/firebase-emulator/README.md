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
