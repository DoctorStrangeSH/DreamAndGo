# Dream&Go — план завершения v1.0

Этот план исполняется строго по [единому ТЗ](PRODUCT_SPEC.md). Не добавлять новые продуктовые функции в ходе выполнения этапов.

## Правила исполнения

- Один активный этап за раз.
- Каждый этап заканчивается работающим сценарием, тестами и обновлением статуса.
- «Файл/класс написан» не означает «функция готова».
- Готовность требует UI, реальных staging-данных, обработки ошибок и критериев приёмки.
- Новые идеи — только в backlog после v1.0.
- Production данные и правила не менять без backup, dry-run, staging и rollback-плана.

## Этапы и выходные условия

### 0. Инвентаризация и фиксация основы
- [x] Сверить main, PR #1 и кандидатные ветки (статический аудит 20.11.2026).
- [x] Составить предварительную матрицу: main / PR candidate / отсутствует / требует staging.
- [x] Зафиксировать архитектурные границы модулей, сервисов и правила расширения после v1.0 ([ARCHITECTURE.md](ARCHITECTURE.md)); фактическая проверка критериев остаётся в релизном QA.
- [x] Синхронизировать канонические документы V1.0 в рабочей ветке и убрать вторую копию ТЗ: `PRODUCT_SPEC.md` — источник истины, `PROJECT_SPEC.md` — ссылка совместимости.
- [x] Выполнить статическую инвентаризацию полного Git tree: 279 файлов в кандидате, без обнаруженных build/dependency/log/binary артефактов и файлов >250 KB.
- [ ] Проверить использование каждого подозрительного файла/ассета по импортам, HTML, CSS, workflow и runtime paths; отсутствие лишнего по одному tree не предполагается.
- [x] Подтвердить GitHub Actions `Checks` на точном документальном HEAD `dc297ac5ec13cbdf4beb82cdb5d9cddd79059819` (`npm test` и `npm run check` — success).
- [ ] Зафиксировать production Rules, Functions, индексы, App Check и регионы (нужен read-only доступ к Firebase Console/CLI; GitHub этого не подтверждает).
- [ ] Подготовить staging и два тестовых аккаунта (нужен доступ к Firebase-проекту и подтверждение владельца).
- **Выход:** нет неизвестных критических зависимостей; scope и текущее состояние подтверждены.

### 1. Безопасность и целостность данных
- [ ] Закрыть все P0 security findings.
- [ ] Проверить Auth, владельцев данных, приватные поля, профили, друзей и блокировки.
- [ ] Проверить реестр никнеймов и миграционный сценарий.
- [ ] Проверить серверные правила/Functions в Emulator и staging.
- [ ] Проверить backup/restore на копии тестовых данных.
- **Выход:** негативные проверки A/B/C проходят; нет доступа к чужим данным; миграции обратимы.

### 2. Основные пользовательские разделы
- [ ] Авторизация и профиль.
- [ ] Мечты.
- [ ] Путешествия.
- [ ] Книги.
- [ ] Фильмы.
- [ ] Рестораны.
- [ ] Друзья и поиск.
- [ ] Достижения и настройки.
- [ ] Уведомления и общие UI-состояния.
- **Выход:** каждый MUST-сценарий имеет UI, сохранение, обработку ошибок, тесты и проверку после перезагрузки.

### 3. Личные текстовые чаты
- [ ] Утвердить безопасную серверную схему.
- [ ] Завершить Emulator и staging backend.
- [ ] Проверить историю, отправку, получение, статусы и read receipts.
- [ ] Проверить сверку после сетевой неопределённости и идемпотентный повтор.
- [ ] Проверить смену аккаунта, блокировки, удаление и миграцию legacy.
- [ ] Проверить локальную очередь в реальном браузере; не заявлять E2E.
- **Выход:** два реальных staging-аккаунта общаются; третий не имеет доступа; legacy-история сохранена; rollout и rollback проверены.

### 4. UX/UI и адаптивность
- [ ] Единая дизайн-система и навигация.
- [ ] Loading/empty/error/saving/success во всех MUST-разделах.
- [ ] Клавиатура, focus, labels, контраст и reduced motion.
- [ ] Проверка 320/390/768/1440 px.
- **Выход:** основные сценарии удобны на телефоне и десктопе; нет критических визуальных дефектов.

### 5. Сквозное QA и релиз
- [ ] Пройти все E2E-сценарии из ТЗ.
- [ ] Проверить staging-аккаунты и изолированные данные.
- [ ] Проверить backup/restore и rollback drill.
- [ ] Убедиться, что CI зелёный на точном release commit.
- [ ] Подготовить release notes, инструкции поддержки и мониторинг.
- [ ] Провести контролируемый production smoke test.
- **Выход:** каждый пункт Definition of Done в ТЗ отмечен доказательством.

## Статус этапов

| Этап | Статус | Блокер / доказательство |
|---|---|---|
| 0. Инвентаризация | Частично выполнен (статический аудит репозитория) | Кодовая матрица зафиксирована ниже; production Firebase и staging требуют подтверждения владельца |
| 1. Безопасность | В работе | Production rules и staging-проверки |
| 2. Основные разделы | Требуют приёмки | Нужны E2E по каждому разделу |
| 3. Чаты | Кандидатная работа в PR #1 | Не включено в production |
| 4. UX/UI | Требует полной проверки | Responsive и accessibility QA |
| 5. Релиз | Заблокирован | Не пройдены release gates |

## Gate 0 — результаты статической инвентаризации (20.11.2026)

### Проверенные точки

- `main` после слияния документального PR #2: `5a4cce6f21cf18cafc7005544eba90385ac92488`.
- PR #1: `refactor/security-foundation`, HEAD `2813adf80080427bb45c2cb09ae949f83e92d940`.
- PR #2 (ТЗ) успешно слит в `main`; в production-код приложения этим PR изменений не внесено.
- PR #1 содержит 229 изменённых файлов. Его текущий статус — OPEN; после обновления `main` GitHub сообщает `mergeable=false`. Это не повод сливать его принудительно.
- На HEAD PR #1 GitHub Actions показывал успешные проверки `test`, `chat-rules` и `screenshots` (один из запусков `test` повторён). Это автоматические проверки кандидатной ветки, не staging и не production-приёмка.

### Матрица текущего состояния

| Область | Что подтверждено по коду | Статус по ТЗ |
|---|---|---|
| Auth / регистрация / восстановление | Базовый Auth есть в main; PR #1 добавляет recovery и более безопасный signup flow | Частично; staging-сценарии не подтверждены |
| Профиль / приватность | Профиль есть в main; PR #1 добавляет публичную проекцию и миграционные инструменты | Частично; production read rules не подтверждены |
| Мечты | CRUD-модуль и сервис есть в main; PR #1 добавляет retry/input policy и тесты | Частично; нужен E2E и тест изоляции |
| Путешествия | CRUD-модуль и сервис есть в main; PR #1 добавляет pagination/search/save-readback/session safety | Частично; нужен E2E |
| Книги | Модуль и сервис есть в main; PR #1 добавляет filters/search-sort/failure tests | Частично; нужен E2E |
| Фильмы | Модуль и сервис есть в main; PR #1 добавляет pagination/request-race tests | Частично; нужен E2E |
| Рестораны | Модуль и сервис есть в main; PR #1 добавляет search-sort tests | Частично; нужен E2E |
| Друзья / поиск | Модули есть в main; PR #1 добавляет нормализацию ника, public-profile projection, quota и safety tests | Частично; нужен тест A/B/C и production rules |
| Личные сообщения | Legacy чат подключён в main; PR #1 содержит большую кандидатную инфраструктуру Chat v2 | Legacy требует E2E; Chat v2 — candidate, не production |
| Достижения | Модуль и сервис есть в main; PR #1 добавляет milestone/race tests | Частично; проверить реальные условия и сохранение |
| Настройки | Модуль есть в main; PR #1 добавляет request-safety и policy tests | Частично; staging и приватность не подтверждены |
| Уведомления | Сервис и виджет есть в main | Частично; проверить события и права |
| Адаптивность / UX | Bootstrap и единый CSS в main; PR #1 содержит Atlas CSS/preview и screenshot workflow | Частично; screenshots — offline preview, не browser E2E |
| Security Rules | 15.11 владелец сообщил, что после обнаружения permissive `allow read, write: if true` опубликовал emergency deny-all `allow read, write: if false`; текущая live-версия после этого не проверялась напрямую | Критический блокер; не заменять на permissive rules без аудита и staging |
| Cloud Functions / Chat v2 | Серверный код находится в PR #1 и явно описан как candidate | Не включено в production |
| Username registry / migrations | Скрипты и серверная реализация находятся в PR #1 | Не запускать до backup/dry-run/staging |
| App Check | Web App Check/reCAPTCHA Enterprise зарегистрирован; по последнему известному состоянию enforcement не включён (15.11) | Нужны read-only проверка текущего состояния и отдельный rollout после staging |
| Backup / restore | Есть candidate rehearsal-код и инструкции в PR #1 | Нужна проверка на копии данных |
| Экспорт / удаление данных | JSON-экспорт частично реализован в main (`travels`, `restaurants`, `movies`, `books`, `dreams`, `friends`, профиль и achievements); состав неполный/не сверенный. Процесса удаления Auth + связанных данных не найдено | Экспорт требует полного инвентаря; удаление аккаунта выключено до безопасного server-side процесса и политики хранения |

### Конкретные P0/P1 находки для Gate 1 (проверка кода main, 20.11.2026)

| ID | Файл / сценарий | Наблюдение | Риск / требование |
|---|---|---|---|
| SEC-01 | `js/modules/settings/settings.js`, `js/modules/profile/profile.js` | Исправлено в main: профильные поля и достижения экранируются; аватар допускает только HTTPS URL; форма настроек привязана к UID; устаревшие ответы после смены аккаунта игнорируются | Частично закрыто; полный XSS-аудит остальных пользовательских шаблонов остаётся блокером |
| SEC-05 | `js/modules/profile/profile.js` | Исправлено в main: email текущего аккаунта больше не выводится при просмотре чужого профиля; статистика приводится к безопасным числам | Закрыто на уровне найденного публичного шаблона; дополнительно проверить Firestore projection/rules на staging |

| SEC-06 | `js/core/security.js`, `js/core/ui-components.js`, `js/modules/notifications/notifications-widget.js`, `js/modules/search/search-modal.js` | Исправлено в main: добавлены общие функции HTML-экранирования, проверки внутренних маршрутов, иконок и ID; текст toast/уведомлений/поисковой выдачи больше не вставляется как доверенный HTML; маршруты уведомлений проходят allowlist | Закрыто для перечисленных шаблонов; остаётся аудит остальных компонентов и вызовов модальных шаблонов |
| SEC-07 | `js/modules/chat/chat.js`, `js/app.js`, `js/modules/dreams/dreams.js`, `js/modules/books/books.js`, `js/modules/travels/travels.js`, `js/modules/restaurants/restaurants.js` | Исправлено в main: экранированы пользовательские поля в карточках и формах редактирования; проверяются ID, HTTPS-источники фотографий и числовые значения прогресса/счётчиков | Частично закрыто; нужен полный остаточный аудит (включая фильмы, достижения, друзей, профильные вкладки), браузерные проверки и проверка старых данных |
| SEC-08 | `js/modules/movies/movies.js`, `js/modules/friends/friends.js`, `js/modules/achievements/achievements.js`, `js/modules/level/level-widget.js`, `js/modules/profile/profile.js` | Исправлено в main: экранированы названия/описания фильмов, рецензии и метаданные достижений; ограничены идентификаторы карточек и HTTPS-постеры; карточки друзей используют безопасные UID и числовую статистику; числовые значения уровня ограничены | Частично закрыто; полный аудит остальных форм/вкладок, браузерные сценарии и тестирование на старых документах ещё обязательны |
| SEC-02 | `js/services/friends.service.js`, `js/services/auth.service.js`, `js/modules/settings/settings.js`, `js/modules/friends/friends.js` | Исправлено в main: поиск идёт по `usernameNormalized` с `limit(1)` и точному legacy fallback с `limit(1)`; результат поиска возвращает только публичную проекцию; новые/изменённые профили сохраняют нормализованный ключ; ошибка поиска показана отдельно от «не найдено» | Частично закрыто; старые профили требуют контролируемого backfill, а публичная проекция и Rules — staging-проверки |
| SEC-03 | `js/services/auth.service.js`, `js/modules/settings/settings.js` | Исправлено в main: проверка ника ограничена запросами по нормализованному и legacy полю; при ошибке регистрация/сохранение блокируются вместо fail-open; новые профили сохраняют `usernameNormalized` | Частично закрыто; окончательная уникальность требует серверного атомарного username registry и миграции legacy-профилей |
| SEC-04 | `js/services/auth.service.js` | Исправлено в main: если создание профиля после создания Auth-пользователя завершается ошибкой, выполняется попытка удалить только что созданный Auth-аккаунт; при неудаче очистки сессия закрывается и пользователю показывается явное сообщение о необходимости восстановления | Частично закрыто; нужен Emulator/staging-тест ошибки Firestore и проверка поведения при неудачном rollback |
| CHAT-01 | `js/services/chat.service.js` | Legacy-клиент сам создаёт обе записи диалога, пишет сообщения и обновляет unread обеих сторон | Серверная проверка участника/полей не доказана; требуется безопасная схема раздела 4.7 |
| CHAT-02 | `js/services/chat.service.js` | Удаление переписки загружает всю историю и пытается удалить её одним batch | Не масштабируется на длинную историю; нарушает надёжность и ограничение Firestore batch |
| DATA-01 | `js/services/export.service.js` | Экспорт JSON существует, но экспортирует только профиль и подколлекции travels/restaurants/movies/books/dreams/friends плюс achievements; сообщения, заявки и другие возможные пользовательские данные не включены | Нельзя считать полным экспортом всех данных из раздела 7 до сверки схемы и расширения/документирования состава |
| DATA-02 | `js/services/auth.service.js` / настройки | Проверенного процесса удаления аккаунта Auth и связанных данных в main не найдено | Удаление аккаунта должно оставаться выключенным; требуется политика хранения/удаления до релиза |

### Что уже исправлено только в кандидатной ветке PR #1 (не production)

- `js/modules/settings/settings.js`: профильные значения выводятся через `escapeHTML`, добавлена проверка владельца формы и защиты от позднего ответа после смены аккаунта.
- `js/services/friends.service.js`: поиск по `usernameNormalized` с `limit(1)` и ограниченный fallback по точному legacy username; больше нет полного чтения `users`.
- `js/services/auth.service.js`: ошибка проверки ника возвращает неопределённый результат вместо fail-open `true`; при этом окончательная атомарная уникальность требует серверного registry rollout.
- PR #1 не слит; эти исправления не должны считаться уже доступными пользователям.

### Важные ограничения и решения

1. **Не сливать PR #1 автоматически.** Документ `docs/RELEASE_READINESS.md` в PR #1 прямо фиксирует HOLD и перечисляет обязательные staging-проверки. Это согласуется с текущим ТЗ.
2. Ветка PR #1 стала отставать от обновлённой `main`; GitHub сейчас сообщает `mergeable=false`. Сначала потребуется безопасно обновить/пересобрать ветку и повторить проверки. Не использовать force-push и не обходить конфликт.
3. `main` содержит дополнительные модули `daily-tasks` и `level`, которых нет в MUST-объёме v1.0. На этом этапе не удалять существующие данные/код. Не расширять их функциональность; принять решение об их сохранении как необязательных элементов либо отключении при финальной сборке только после проверки зависимостей.
4. В `main` нет корневого `package.json` и тестового набора; они добавлены в PR #1. Поэтому зелёные тесты PR #1 нельзя приписывать текущему `main`.
5. В `main` отсутствует актуальный файл production Firestore Rules. По последнему подтверждённому сообщению владельца от 15.11 исходные правила содержали `allow read, write: if true`, после чего владелец сообщил об успешной публикации emergency deny-all `allow read, write: if false`. Это исторически подтверждённое действие, но текущая live-версия правил после него не читалась напрямую. Если deny-all всё ещё активен, Firestore-сценарии приложения могут быть недоступны; нельзя исправлять это открывающими правилами наугад. Нужен точный read-only экспорт действующих правил и проверка всех коллекций.

### Что осталось, чтобы закрыть Gate 0

- [x] Сравнить структуру `main` и PR #1.
- [x] Составить предварительную матрицу реализованных модулей и кандидатной работы.
- [x] Проверить состояние CI на HEAD PR #1.
- [ ] Повторно прочитать текущие production Firebase Rules, индексы, Functions, App Check и фактические регионы в read-only режиме. Последнее известное состояние: проект `dream-and-go`, Firestore Native в `eur3`; 15.11 владелец сообщил о публикации emergency deny-all после выявления `allow read, write: if true`; App Check Web зарегистрирован, enforcement не включён. Эти значения нужно подтвердить заново, прежде чем менять что-либо.
- [ ] Подготовить/подтвердить изолированный staging и два тестовых аккаунта.
- [ ] Сверить состав существующего JSON-экспорта с полной схемой пользовательских данных; определить и реализовать политику хранения/удаления и безопасный процесс удаления Auth + связанных данных.
- **Gate 0 остаётся открытым**, пока не подтверждены реальные Firebase/staging зависимости. Кодовая инвентаризация завершена предварительно; продукт не объявляется готовым.

## Не начинать до v1.0

Вложения/голосовые, группы, ленту, реакции, рекомендации, AI, внешние API, платежи, подписки, PWA и новые разделы. Это backlog после выпуска.


### Notification security containment — 2026-11-21

- [x] Removed the generic client write API that allowed arbitrary notification recipients and payloads.
- [x] Added active-UID guards to notification subscription and read-state mutation methods.
- [x] Added regression tests for the removed write surface, owner binding and document ID validation.
- [x] Implement server-generated notifications for friend request/acceptance and newly awarded achievements; retain no generic client-selected recipient endpoint.
- [x] Implement server-generated message notifications in the candidate private-message transaction with idempotent message-based IDs.
- [x] Add isolated notification Rules Emulator tests for owner-only reads and read-state-only updates. Production Rules integration remains blocked on the complete Rules configuration.
- [ ] Verify notification delivery/read-state in staging with two accounts and App Check.
- **Exit condition not met:** notification creation is contained on the candidate client, but the end-to-end V1.0 notification requirement is not accepted yet.


### Trusted friendship notification delivery — 2026-11-21

- [x] Friend request notification is written only by the authenticated/App-Check protected friendship callable's Admin SDK transaction.
- [x] Friend acceptance notification is written to the original sender's own notification collection in the same transaction as relationship acceptance.
- [x] Fixed payload schema and deterministic event document IDs are covered by transaction tests.
- [x] Add trusted achievement notifications in the server stats transaction and trusted message notifications in the private-message transaction; no client-selected notification payload is accepted.
- [x] Add notification Rules Emulator tests for guest, cross-user and owner read-state cases (7/7 Rules tests passed; run 44893915020).
- [ ] Validate friend, achievement and message notifications in staging with two accounts and App Check.
- **Exit condition not met:** all three event sources are implemented in candidate code; authorization and staging remain release gates.


### Friendship notification consistency — 2026-11-21

- [x] Remove pending request notices atomically on cancel, accept and reject.
- [x] Keep acceptance notice creation in the same transaction as symmetric friendship creation.
- [x] Add regression assertions for request-notice cleanup on all three resolution paths.
- [ ] Verify root test/check workflows on exact candidate HEAD; no successful CI result is recorded yet.
- [x] Verify owner-only notification Rules in the isolated Emulator fixture (7/7 Rules tests passed; run 44893915020).
- [ ] Verify two-account staging behavior with App Check.


### Achievement notification delivery — 2026-11-21

- [x] Create achievement notifications only from the trusted server-side achievement award transaction.
- [x] Keep achievement persistence and notification creation atomic.
- [x] Use stable achievement/level document IDs and a fixed payload; add Emulator regression coverage for payload and repeat refresh.
- [x] Root Checks passed: 461/461 tests and syntax validation for 253 JavaScript files on implementation HEAD `d311e26065e01d5044e73f049c4629988dd5cf9b` (run 44893286852); latest docs-only HEAD also passed Checks (run 44893346213).
- [x] Firebase Emulator passed 6/6 Firestore Rules tests and 59/59 server/Auth/Firestore emulator tests on the same implementation HEAD (run 44893286823). Existing Rules coverage is not notification-specific.
- [x] Add and pass notification-specific Rules read/update tests (7/7 Rules tests passed; run 44893915020).
- [ ] Verify two-account staging behavior with App Check.
- **Exit condition not met:** achievement notification writes are implemented, but full notification Rules and end-to-end staging acceptance remain release gates.


### Trusted message notification delivery — 2026-11-21

- [x] Create a message notification only from the trusted server-side private-message transaction.
- [x] Derive recipient from the validated two-person chat and create the notice atomically with the message/unread write.
- [x] Use a stable server-message-based ID and bounded preview; cover exact schema and retry idempotency in Emulator tests.
- [ ] Verify root Checks and Firebase Emulator workflow on exact candidate HEAD.
- [x] Add isolated notification Rules Emulator tests: owner read, guest/cross-user denial, client create/delete denial, and one-way owner read-state update with immutable event fields. This fixture is not deployable production Rules.
- [ ] Integrate the notification access contract into the complete production Rules candidate and validate delivery/read-state in staging with two accounts and App Check.
- **Exit condition not met:** message event generation is implemented in candidate code, but Rules and staging acceptance remain release gates.


### Notification milestone verification — 2026-11-21

- [x] Root Checks passed on candidate HEAD `05961cb3bcec5f6fbe6b70e84f2b261c700e9237`: 461/461 tests, 0 failures; syntax checks passed for 254 JavaScript files ([run 44893947666](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44893947666)).
- [x] Firebase Emulator workflow passed: 7/7 isolated Firestore Rules tests and 59/59 server/Auth/Firestore Emulator tests ([run 44893915020](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/44893915020)).
- [ ] Obtain/review the active production Firestore Rules and integrate the approved notification contract into the complete production Rules configuration. The candidate branch has no root `firestore.rules` or `firebase.json`; isolated fixtures are test-only.
- [ ] Validate friend, achievement and message notifications across two staging accounts with App Check.
- **Exit condition:** candidate event generation and isolated Rules coverage are tested; production authorization and staging acceptance are still open.
