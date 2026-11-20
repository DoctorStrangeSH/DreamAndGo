# Dream&Go — аудит чистоты репозитория

Дата проверки: 2026-11-20  
Ветка проверки: `refactor/security-foundation`  
Область: статическая проверка GitHub-файлов и инженерной конфигурации. Это не локальный filesystem scan.

## Подтверждено и исправлено

- [x] Получено полное Git tree через GitHub API: кандидатная ветка содержит 310 записей (279 файлов, 12 директорий); `main` — 69 записей (46 файлов, 5 директорий).
- [x] В кандидатном tree не обнаружены `node_modules`, `dist`, `build`, `coverage`, `.firebase`, логи, `.env`, архивы и распространённые бинарные ассеты; нет файлов больше 250 KB. Это проверка имён/размеров Git tree, не сканирование секретов в содержимом или истории.
- [x] Точный HEAD PR #1 `066e9e797092f84b521270991201830b279894cd`: GitHub Actions `Checks` завершился успешно; шаги `npm test` и `npm run check` оба успешны.

- [x] Добавлен корневой `.gitignore` для зависимостей, локальных env-файлов (с исключением example-файлов), Firebase Emulator state/logs, тестовых отчётов и OS/editor временных файлов.
- [x] Удалены дублирующиеся `node --check` записи для `js/modules/daily-tasks/daily-tasks.js` и `js/config/firebase.js` из команды `npm run check` (сами проверки сохранены).
- [x] Не изменялись production-конфигурация Firebase, пользовательские данные, история Git и рабочие исходники.

## Подтверждённые ограничения / не считать дефектом автоматически

- Production `firestore.rules`, `firebase.json` и индексы не найдены в проверенной ветке `main`. Их отсутствие в Git не доказывает отсутствие конфигурации в Firebase Console. Не создавать и не развёртывать замену без read-only экспорта фактической конфигурации.
- `package-lock.json` не найден в проверенной ветке `main`. Не генерировать lockfile вслепую: сначала проверить, какие зависимости реально используются и как выполняется CI.
- `dist/`, `build/`, assets и screenshots не добавлены в ignore: без полного tree/dependency audit нельзя предполагать, что это генерируемые или ненужные файлы.
- Документы v1.0 синхронизированы в кандидатной ветке: добавлены канонические `PRODUCT_SPEC.md`, `DELIVERY_PLAN.md`, `ARCHITECTURE.md`; старый `PROJECT_SPEC.md` превращён в короткую ссылку на единственный источник истины.

## Осталось выполнить

- [x] Статическая инвентаризация полного Git tree и крупных файлов выполнена.
- [ ] Проверить содержимое исходников и историю Git на секреты; tree-имена и размеры не доказывают отсутствие секретов.
- [x] Подтвердить CI на точном HEAD `066e9e797092f84b521270991201830b279894cd`: `Checks` success.
- [ ] Поиск неиспользуемых модулей/ассетов с проверкой импортов, динамических путей, HTML-ссылок и GitHub Actions.
- [x] Заменён ручной неполный список `node --check` на автоматический обход `js/`, `server/`, `scripts/`, `tests/`; проверяются все `.js`, `.mjs`, `.cjs` файлы.
- [ ] Проверка секретов в истории Git и текущем дереве; найденные секреты считать скомпрометированными и ротировать, не просто удалять файл.
- [x] Сверить зависимости, lockfile и CI install strategy: package.json не содержит dependencies/devDependencies, npm-скрипты используют встроенный Node.js, package-lock.json отсутствует и сейчас не требуется; CI не устанавливает npm-пакеты.
- [x] Проверить и выровнять ссылки между README, PRODUCT_SPEC, DELIVERY_PLAN, ARCHITECTURE, ROADMAP и RELEASE_READINESS.
- [ ] Провести оставшийся аудит других документов и ссылок, включая документы миграций и Chat v2.
- [ ] После каждого удаления/перемещения выполнить тесты и сборочные проверки на точном HEAD.

## Граница текущего аудита

- Git tree проверен полностью, но неиспользуемость кода/ассетов не установлена: нужны поиск импортов, HTML-ссылок, dynamic imports, CSS URLs, workflow references и runtime paths.
- История ветки PR #1 отличается от `main`: compare reports `diverged`, 1011 commits ahead, 53 behind, merge base `ffc60beca6d1f7840c52483019e4d8e0117de08c`. PR remains non-mergeable. Не выполнять массовое удаление, rebase или merge в рамках косметической уборки.

## Правило удаления

Ничего не удалять только по названию, возрасту, размеру или отсутствию очевидного импорта. Перед удалением доказать, что файл не используется статически, динамически, через конфигурацию, HTML, тесты, workflow или внешние ссылки. Не переписывать историю и не force-push.

## Итог

Уборка начата; это не заявление о полной чистоте репозитория. Закрыты только безопасные, проверяемые пункты выше. Остальные пункты остаются открытыми до получения полного дерева и проверки зависимостей.


### Дополнительная проверка asset references — 2026-11-20

- [x] Сверены статические ссылки `index.html` с полным Git tree.
- [x] Удалены два нерабочих fallback-ссылочных обработчика на отсутствующие `css/bootstrap.min.css` и `js/bootstrap.bundle.min.js`. Основные Bootstrap CDN подключения сохранены.
- [x] Проверить все 8 CSS-файлов на локальные `url(...)`-ресурсы: таких ссылок не обнаружено.
- [ ] Проверить динамические импорты, ссылки из шаблонов и runtime-loaded assets.


### Полнота JavaScript syntax checks — 2026-11-20

- [x] Добавлен `scripts/check-syntax.mjs`: рекурсивно находит JavaScript-файлы в `js/`, `server/`, `scripts/`, `tests/` и запускает для каждого `node --check`.
- [x] `npm run check` переведён с длинного вручную поддерживаемого списка файлов на единый полный проход.
- [ ] Дождаться CI на новом HEAD и устранить обнаруженные ошибки, если они появятся.
- [ ] В дальнейшем добавлять новые исходные каталоги в список roots только после проверки структуры репозитория.


### Dependency and CSS reference audit — 2026-11-20

- [x] Проверен `package.json`: `dependencies` и `devDependencies` пусты; используемые npm scripts запускают Node.js и встроенный test runner.
- [x] Проверен Git tree: `package-lock.json` отсутствует. При нулевом npm dependency graph lockfile не нужен; не создавать пустой lockfile ради формальности.
- [x] Проверена CI install strategy: workflow использует Node.js 22 и запускает `npm test` / `npm run check`, не устанавливая npm-пакеты.
- [x] Все 8 CSS-файлов проверены на локальные `url(...)` ссылки; локальных CSS asset references не найдено.
- [x] Зафиксированы используемые CDN/runtime SDK и их закреплённые версии.
- [ ] Проверить CDN availability, CSP, API-key restrictions и App Check в staging.
- [ ] Динамические импорты, HTML templates и runtime-loaded asset paths требуют отдельного полного графа ссылок.


### External runtime dependencies — 2026-11-20

- [x] Reviewed the app entry HTML and Firebase config imports.
- [x] Browser runtime uses pinned CDN versions: Firebase JS SDK 10.7.1, Bootstrap 5.3.2, Bootstrap Icons 1.11.3; Google Fonts (Inter/Manrope) are externally hosted.
- [x] Firebase web config contains a client API key and reCAPTCHA Enterprise site key, which are browser-public identifiers, not server secrets. No secret value is copied into this audit. Restrict the Firebase API key to the intended APIs/domains in Google Cloud/Firebase Console and maintain Security Rules/App Check as the actual access controls.
- [ ] Confirm CDN availability, CSP compatibility, API-key restrictions and App Check enforcement in staging.
- [ ] Review commit history and current source content for actual secrets; this targeted config review is not a full secret scan.


### Targeted secret and Firebase Rules review — 2026-11-20

- [x] Scanned 20 high-risk current-branch files (Firebase client config, App Check bootstrap, server entrypoints, migration CLIs, Admin SDK helpers, package manifests, GitHub Actions and candidate rules) for common private-key, service-account-key, cloud access-key, GitHub/Slack/Stripe token and secret-assignment patterns. No matches were found in this targeted sample.
- [ ] This is not a full repository or Git-history secret scan. Scan all tracked text files and historical commits before release. If a real credential is found, rotate/revoke it; removing it from the current tree is insufficient.
- [x] Confirmed no root-level production `firestore.rules`, `storage.rules` or `firebase.json` is present in the branch tree. The rules under `tests/firebase-emulator/` are explicitly candidate/test-only.
- [x] Reviewed `owner-read.rules`: broad catch-all denies all unspecified access; private collection writes and profile creation are intentionally disabled. This is a read-only recovery prototype, not a complete production ruleset.
- [x] Reviewed `chat.rules`: it only models the proposed `chats/{chatId}/messages` membership model and denies unrelated collections. It is not a drop-in ruleset for the current application.
- [ ] Build and test a complete production Rules set against the actual V1.0 data model and every client/server operation. Do not deploy either candidate rules file as-is.


### Firestore access matrix — 2026-11-20

- [x] Audited actual client Firestore paths and CRUD operations across auth, dreams, travels, books, movies, restaurants, friends, notifications, legacy chat, profile, achievements, search and export.
- [x] Audited Admin SDK callable/trigger surfaces for registration, public profiles, Chat V2, stats/achievements, XP and daily tasks.
- [x] Added a consolidated access matrix and Emulator attack/negative-test checklist in `docs/FIRESTORE_ACCESS_MATRIX.md`.
- [ ] Rules implementation remains intentionally blocked until production Rules and sanitized live schema are confirmed; do not derive production permissions from client-side checks alone.


### Public profile consent audit

- [x] Public projections now fail closed unless the owner has explicitly set `publicProfileEnabled: true`.
- [x] Migration skips private profiles and checks username collisions across all users.
- [ ] Privacy setting UI and production Rules remain open; do not treat the candidate field as a finished product setting.


### Public profile read path cleanup

- [x] Friend search and social profile cards no longer need direct reads of other users' private profile documents.
- [x] Batch reads are bounded to 50 IDs and use one callable per batch.
- [x] Profile route keeps direct Firestore read only for the signed-in owner's own document.
- [ ] Verify no other module performs direct cross-user reads before tightening production Firestore Rules.


### Public profile privacy control cleanup

- [x] Replaced any future client-side privacy-flag mutation requirement with one server-owned callable.
- [x] Added an explicit settings switch, fail-closed default, optimistic rollback on errors, and account-switch guards.
- [x] Added server policy tests and client wiring tests.
- [ ] Emulator/staging end-to-end validation remains required before production rollout.


### Consent flag regression cleanup

- [x] Added explicit rules-test coverage for client-side writes of the visibility flag.
- [x] Added DTO allowlist assertions for both client and server public projections.
- [ ] Emulator CI rerun required after these test changes.
