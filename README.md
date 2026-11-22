<div align="center">

# Dream&Go

### Мечтай. Планируй. Исследуй.

Личное пространство для мечтаний, путешествий, коллекций впечатлений и общения с друзьями.

[![Checks](https://github.com/DoctorStrangeSH/DreamAndGo/actions/workflows/checks.yml/badge.svg?branch=integration/v1.0-reconciliation)](https://github.com/DoctorStrangeSH/DreamAndGo/actions/workflows/checks.yml?query=branch%3Aintegration%2Fv1.0-reconciliation)
![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Emulator%20tests-FFCA28?logo=firebase&logoColor=222)
![Release](https://img.shields.io/badge/release-v1.0%20in%20progress-64748b)

</div>

---

## О проекте

**Dream&Go** — русскоязычная адаптивная веб-платформа, которая помогает собирать личные мечты и цели, сохранять путешествия и впечатления, вести коллекции книг, фильмов и ресторанов, находить друзей и общаться с ними.

Проект развивается как модульное веб-приложение на нативных JavaScript ES Modules с Firebase. Главный приоритет — понятный пользовательский опыт, сохранность данных и приватность по умолчанию.

## Возможности продукта

| Раздел | Назначение |
| --- | --- |
| Мечты | Личные желания, цели и прогресс |
| Путешествия | Планирование и коллекция поездок |
| Книги, фильмы, рестораны | Личные коллекции впечатлений |
| Друзья и поиск | Поиск пользователей и социальные связи |
| Чаты | Личное текстовое общение |
| Достижения | Прогресс и игровые элементы профиля |
| Профиль и настройки | Личные данные и управление приватностью |

Наличие раздела в интерфейсе не означает, что его релизные критерии уже приняты. Фактический статус ведётся в дорожной карте.

## Текущий статус

Разработка ведётся по зафиксированному объёму **V1.0**. Релиз не объявляется готовым, пока не пройдены все критерии приёмки, интеграционные проверки и staging-проверки из ТЗ.

- [Единое ТЗ](docs/PRODUCT_SPEC.md)
- [План завершения V1.0](docs/DELIVERY_PLAN.md)
- [Дорожная карта](docs/ROADMAP.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [Индекс документации](docs/README.md)

Новые идеи, не входящие в MUST-объём V1.0, откладываются в backlog следующей версии. Это защищает проект от бесконечного расширения до первого релиза.

## Быстрый запуск

### Требования

- Современный браузер с поддержкой JavaScript ES Modules.
- Python 3 или любой статический HTTP-сервер.
- Node.js 22+ — для тестов и инструментов разработки.
- Firebase Emulator Suite — для интеграционных тестов.

### Запустить веб-клиент

Из корня репозитория:

```bash
python -m http.server 8080
```

Откройте [http://localhost:8080](http://localhost:8080).

> Не открывайте `index.html` через `file://`: ES Modules и Firebase требуют HTTP(S)-контекст.

### Запустить проверки

```bash
npm install --prefix server --no-package-lock --ignore-scripts
npm test
npm run check
```

Auth и Firestore Emulator integration suite:

```bash
npx --yes firebase-tools@14.22.0 emulators:exec --only auth,firestore --project demo-dream-and-go "npm --prefix server run test:emulator"
```

Эмуляторы используют демонстрационный project ID. Эти команды не являются разрешением на запуск миграций или изменение production Firebase.

## Структура репозитория

```text
.
├── .github/          # CI и шаблоны GitHub
├── css/              # Общие стили приложения
├── docs/             # ТЗ, архитектура, планы и аудиты
├── js/
│   ├── config/       # Конфигурация клиента
│   ├── core/         # Общие механизмы приложения
│   ├── modules/      # Пользовательские разделы
│   └── services/     # Доступ к данным и операции
├── scripts/          # Инструменты проверки
├── server/           # Firebase Functions и Emulator tests
├── tests/            # Клиентские unit-тесты
├── firebase.json
├── firestore.rules
└── index.html
```

Подробные границы модулей описаны в [архитектурном контракте](docs/ARCHITECTURE.md).

## Безопасность и данные

- Firestore Rules в интеграционной ветке работают по принципу **deny by default**.
- Серверные функции и клиентские адаптеры в этой ветке не считаются развёрнутыми в production.
- Не добавляйте ключи, токены, пароли, service-account JSON и реальные пользовательские данные в Git.
- Не публикуйте Rules и Functions и не запускайте миграции без backup, dry-run, staging-проверки и rollback-плана.
- Любая операция с чужими данными должна быть авторизована на доверенной серверной стороне.

Подробнее: [SECURITY.md](SECURITY.md) и [матрица доступа Firestore](docs/FIRESTORE_ACCESS_MATRIX.md).

## Участие в разработке

Перед изменениями прочитайте [CONTRIBUTING.md](CONTRIBUTING.md). Все изменения V1.0 должны соответствовать ТЗ, сопровождаться тестами и обновлением статуса в документации.

---

<div align="center">

**Dream&Go — собирай впечатления, а не вкладки с планами.**

</div>
