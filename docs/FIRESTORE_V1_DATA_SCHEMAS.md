# Firestore V1.0 — фактические схемы пользовательских коллекций

**Статус:** контракт, извлечённый из текущих client validators и write services. Это основа для Emulator/Rules, но не готовый production Rules файл.  
**Проверено:** 2026-11-21.  
**Источники кода:** `js/core/dream-input-policy.js`, `js/core/collection-input-policy.js`, `js/services/{dreams,travel,book,movie,restaurant}.service.js`.

## Общие правила

- Все пять коллекций находятся под `users/{uid}/{collection}/{documentId}`; клиентские сервисы проверяют совпадение UID с текущей Firebase Auth сессией.
- При создании сервисы добавляют `createdAt` и `updatedAt` как Firestore server timestamps.
- При обновлении сервисы меняют только прошедшие validator поля и обновляют `updatedAt`; `createdAt` не должен изменяться.
- Validator — клиентская проверка удобства и ранней обратной связи. Она не является authorization: production Rules должны повторять критические проверки на стороне Firestore.
- Удаление — отдельная операция владельца; серверные счётчики и XP не должны приниматься из payload документа.
- Любые legacy документы, не соответствующие контракту, требуют инвентаризации и миграции до включения строгих Rules. Не удалять и не переписывать их автоматически.

## 1. `users/{uid}/dreams/{id}`

| Поле | Тип / ограничения | Обязательность при create |
|---|---|---|
| `title` | string, после trim 1–120 | Да |
| `category` | string: `''`, Путешествия, Карьера, Творчество, Спорт, Отношения, Знания, Материальное, Другое | Нет, default `''` |
| `status` | `dreaming` / `in_progress` / `completed` | Нет, default `dreaming` |
| `description` | string, max 4000 | Нет, default `''` |
| `progress` | integer 0–100 | Нет, default 0 |
| `deadline` | null или пустая строка, либо реальная календарная дата `YYYY-MM-DD` | Нет, default null |
| `steps` | array max 20; item ровно `{text:string(1..200), done:boolean}` | Нет, default [] |
| `createdAt`, `updatedAt` | Firestore timestamp; серверное время запроса | Да, добавляет сервис |

При update клиент передаёт только поля мечты из validator; сервис сохраняет `createdAt`, а `updatedAt` обновляет серверным временем. Новые документы не получают `isPublic`.

## 2. `users/{uid}/travels/{id}`

| Поле | Тип / ограничения | Обязательность при create |
|---|---|---|
| `title` | string 1–120 | Да |
| `type` | `city` / `nature` / `mountains` / `beach` / `culture` | Да |
| `status` | `planned` / `visited` | Да |
| `location` | string max 200 | Нет |
| `description` | string max 4000 | Нет |
| `budget` | map ровно `planned:int(0..1e9), spent:int(0..1e9), currency:RUB/USD/EUR` | Нет |
| `rating` | integer 0–10 | Нет |
| `notes` | string max 4000; сейчас validator принимает поле | Нет |
| `photos` | array max 10 HTTPS URL, каждый max 2048 | Нет |
| `createdAt`, `updatedAt` | Firestore timestamp | Да, добавляет сервис |

## 3. `users/{uid}/books/{id}`

| Поле | Тип / ограничения | Обязательность при create |
|---|---|---|
| `title` | string 1–200 | Да |
| `author` | string 1–120 | Да |
| `status` | `want_to_read` / `reading` / `read` | Да |
| `genres` | array max 10; уникальные строки max 40 из утверждённого набора жанров | Нет |
| `year` | null или integer 1000–2099 | Нет |
| `totalPages`, `currentPage` | integer 0–100000; currentPage не больше totalPages | Нет |
| `userRating` | integer 0–10 | Нет |
| `review` | string max 4000 | Нет |
| `quotes` | array max 30; уникальные строки max 500 | Нет |
| `notes` | string; сейчас сервис устанавливает пустую строку | Да, добавляет сервис |
| `createdAt`, `updatedAt` | Firestore timestamp | Да, добавляет сервис |

Допустимые жанры: Фантастика, Детектив, Роман, Биография, История, Психология, Бизнес, Наука, Философия, Другое.

## 4. `users/{uid}/movies/{id}`

| Поле | Тип / ограничения | Обязательность при create |
|---|---|---|
| `movieId` | integer 1–1,000,000,000 | Да |
| `title` | string 1–200 | Да |
| `status` | `to_watch` / `watched` | Да |
| `originalTitle` | string max 200 | Нет |
| `overview` | string max 5000 | Нет |
| `poster`, `backdrop` | пустая строка или HTTPS URL max 2048 | Нет |
| `voteAverage`, `rating` | finite number 0–10 | Нет |
| `voteCount` | integer 0–1,000,000,000 | Нет |
| `releaseDate` | пустая строка или реальная дата `YYYY-MM-DD` | Нет |
| `genreIds` | array max 20 уникальных integer из TMDB allowlist | Нет |
| `runtime` | integer 0–1000 | Нет |
| `tagline` | string max 300 | Нет |
| `budget` | integer 0–100,000,000,000 | Нет |
| `productionCountries` | array max 30; item ровно `{iso_3166_1:string(1..2), name:string(1..80)}` | Нет |
| `userRating` | integer 0–5 | Нет |
| `review` | string max 4000 | Нет |
| `notes` | string; сейчас сервис устанавливает пустую строку | Да, добавляет сервис |
| `createdAt`, `updatedAt` | Firestore timestamp | Да, добавляет сервис |

Жанры (TMDB IDs): 28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37.

## 5. `users/{uid}/restaurants/{id}`

| Поле | Тип / ограничения | Обязательность при create |
|---|---|---|
| `name` | string 1–160 | Да |
| `cuisine` | `''`, Итальянская, Японская, Русская, Французская, Мексиканская, Китайская, Индийская, Грузинская | Да |
| `status` | `want_to_visit` / `visited` | Да |
| `address` | string max 300 | Нет |
| `visitDate` | null/пустая строка или реальная дата `YYYY-MM-DD` | Нет |
| `avgBill` | integer 0–10,000,000 | Нет |
| `userRating` | integer 0–10 | Нет |
| `favoriteDishes` | array max 20; уникальные строки max 80 | Нет |
| `review` | string max 4000 | Нет |
| `photos` | array max 10 HTTPS URL, каждый max 2048 | Нет |
| `notes` | string; сейчас сервис устанавливает пустую строку | Да, добавляет сервис |
| `createdAt`, `updatedAt` | Firestore timestamp | Да, добавляет сервис |

## 6. Важные расхождения и решения до production Rules

1. **Публичность записей не входит в личную схему V1.0.** Candidate services больше не записывают `isPublic` ни в одну из пяти личных коллекций. Старые документы могут содержать исторические значения; они не дают права чтения. Публичное отображение возможно только через отдельную allowlist-проекцию с явным согласием владельца.
2. **Дополнительные поля.** Book/movie/restaurant services добавляют `notes: ''`, хотя соответствующие input allowlists не принимают notes от формы. В Rules это серверно/сервисно добавляемое поле с фиксированным типом; нельзя разрешать произвольный клиентский notes, если форма его не редактирует.
3. **Legacy shape.** Текущие пользовательские документы могут содержать старые поля, отсутствующие в validator allowlist. Нужен sanitized schema inventory и dry-run migration до строгих write rules.
4. **Клиентская проверка недостаточна.** Rules должны повторить field allowlist, обязательность, типы, диапазоны, nested map keys, размеры списков и неизменяемость `createdAt`; query rules должны соответствовать реальным запросам.
5. **Legacy-поля.** Не выполнять массовое удаление исторических `isPublic` без отдельного аудита и миграции. Новые записи не создают это поле; Rules должны игнорировать его как источник публичных прав.

## 7. Следующие обязательные проверки

- [ ] Подтвердить фактические поля на существующих аккаунтах без экспорта PII.
- [x] Зафиксировать личные коллекции как owner-only; новые записи не получают `isPublic`. Публичный показ возможен только через отдельную проекцию с явным согласием.
- [ ] Добавить Emulator tests на валидный create/update и негативные значения каждой из пяти коллекций.
- [ ] Сверить все update payloads с validators и запретить изменение server timestamps.
- [ ] Только после этого создавать production-ready Rules candidate.


## 8. Public profile consent field (candidate contract)

`users/{uid}.publicProfileEnabled` is a boolean opt-in gate for public profile projection. Missing, false, or malformed values mean **private**. It must only be changed by the authenticated owner through an explicit privacy setting; no client may set it through arbitrary profile payloads. Public projections remain a separate allowlisted document and never expose the private `users/{uid}` document.

This is a candidate security contract: the settings UI and production Firestore Rules are not yet complete. Migration is create-only and includes only accounts with the field explicitly set to true. It still scans all valid usernames for case-insensitive collisions, including private accounts.


## 9. Private collection visibility flag removal — 2026-11-21

- Candidate write services for dreams, travels, books and restaurants no longer persist `isPublic: true/false`; movie service also remains without this field.
- Added `tests/private-collection-visibility.test.js` to assert that none of the five private collection services writes an `isPublic` field.
- Existing legacy documents are not modified. Historical `isPublic` values are not authorization and must not be used to expose private subcollection documents.
- Public sharing remains a separate explicit-consent projection and is outside these private collection documents.


## 10. Emulator recovery fixture scope — 2026-11-21

The current `tests/firebase-emulator/owner-read.rules` is a deliberately limited **read-only recovery prototype**, not the production CRUD contract:

- It checks owner-only reads for all five private collections and denies guest/cross-account reads.
- It permits validated create/update/delete only for `dreams`; the other four collections are deliberately write-denied in this fixture.
- The dream fixture has now been reconciled with the current new-write service contract: `isPublic` is not required and both `isPublic: true` and `isPublic: false` are rejected as unknown fields.
- Emulator coverage for valid CRUD and field-level negative cases in travels, books, movies and restaurants remains outstanding.
- Do not call this fixture full V1.0 Rules coverage and do not deploy it.


## 11. Dream Emulator fixture alignment — 2026-11-21

- [x] Removed the legacy `isPublic` requirement from the candidate dream Rules fixture.
- [x] Valid dream create/update fixtures now match `validateDreamInput` output plus server timestamps.
- [x] Added negative Emulator cases rejecting both `isPublic: true` and `isPublic: false` on create and update.
- [ ] Run Firebase Emulator CI and retain passing evidence.
- [ ] Implement equivalent validated Emulator CRUD coverage for travels, books, movies and restaurants.
