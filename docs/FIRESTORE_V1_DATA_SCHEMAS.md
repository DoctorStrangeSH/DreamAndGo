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


### Travel partial-update contract — 2026-11-21

- A partial update may contain only selected top-level travel fields.
- If `budget` is supplied, it is an atomic nested-map replacement and must contain exactly `planned`, `spent`, and `currency` with the same type/range/enum constraints as create. Partial nested budget fragments are rejected to avoid silently dropping sibling values.
- Unknown nested budget keys are rejected by the client validator. The final Firestore Rules candidate must enforce the same exact key set and value constraints.
- The service treats statistics refresh as derived/best-effort work after the primary write; a secondary refresh failure must not cause a retry of a committed travel write.


### Movie collection validation follow-up — 2026-11-21

- Movie metadata fields remain bounded by the client allowlist: TMDB identifier, title/text lengths, HTTPS poster/backdrop URLs, rating ranges, integer counters, release date, known genre IDs, runtime, budget, country map keys, status, user rating and review.
- Regression coverage explicitly rejects impossible calendar dates and duplicate genre IDs. The authoritative Firestore Rules candidate must enforce corresponding types/ranges and nested country-map key constraints.
- Statistics refresh is derived work after the primary movie write. Its failure must not cause the client to retry a movie create/update that Firestore already committed.


### Restaurant collection validation follow-up — 2026-11-21

- Restaurant input validation covers name, cuisine/status allowlists, bounded address, nullable visit date, bill range, user rating range, bounded favorite dishes, review length and HTTPS photo URLs/list bounds.
- Regression coverage rejects unknown cuisine/status values, impossible visit dates, out-of-range ratings, excessive favorite-dish and photo counts, while preserving explicit `visitDate: null` for partial updates.
- The authoritative Firestore Rules candidate must enforce equivalent types, ranges, list limits and nested field restrictions; client validators remain defense in depth.
- Derived statistics refresh is secondary work after the primary restaurant write. Its failure must not cause a retry of a restaurant create/update already committed by Firestore.


### Cross-collection write-result contract — 2026-11-21

- For all five private collection services, a confirmed primary create/update/delete operation determines the operation's success result.
- User statistics are derived data and are refreshed best-effort after the primary operation. A statistics refresh error is logged but must not report a committed primary write as failed.
- This client contract prevents duplicate retries caused by false failure responses. It does not guarantee that derived statistics are current; Emulator and integration tests must cover this distinction.
- Firestore Rules remain authoritative for owner access, field allowlists, immutable timestamps, type/range checks and cross-account isolation.


### Dreams visibility compatibility contract — 2026-11-21

- New client-created dream documents omit `isPublic` (preferred) or may explicitly set it to `false`; client creation with `true` is denied.
- If a legacy document already contains `isPublic`, it must be boolean. Client updates cannot change the value.
- This preserves the visibility of older records while keeping the field outside the client-editable dream input schema. Any future visibility feature requires a separately specified trusted workflow; it is not part of V1 client CRUD.


## 12. Legacy document compatibility findings — 2026-11-21

Synthetic historical-shape fixtures are now defined for all five private collections. They intentionally omit `createdAt` and `updatedAt` and use historical field/status names. Under the isolated candidate fixture, the owner can read a legacy document directly by ID and delete it, but strict V1 update validation rejects it. The current list services order by `createdAt`; Firestore does not return documents missing that field in that query, so some legacy records can be invisible in collection lists.

This is a confirmed compatibility risk in the candidate contract, not a reason to weaken Rules. Before V1 release:
1. Inventory legacy document shapes without exposing personal content.
2. Define deterministic field/status normalization and preserve unknown historical data in a backup or quarantine field/record.
3. Run a dry-run migration report and review counts/examples with redacted values.
4. Back up affected data and define rollback.
5. Migrate in bounded batches with idempotency and per-document error reporting.
6. Update list services to handle missing timestamps during the transition.
7. Re-run Emulator tests against both pre-migration and normalized fixtures.

No production data migration has been run. Synthetic tests only.


## 13. Offline legacy collection inventory tool — 2026-11-21

Added `npm run audit:legacy-collections -- /path/to/minimized-export.json`.

The command is deliberately offline and read-only. It accepts a metadata-only JSON array of records shaped as `{ "collection": "books", "fields": { "title": "string", "createdAt": "timestamp" }, "status": "read" }`, where collection is one of the five private V1 collections. Allowed coarse field types are `string`, `boolean`, `integer`, `number`, `null`, `array`, `map`, `timestamp`, and `unknown`. The optional `status` contains only a categorical status label (max 64 characters). Do not include document IDs, actual field values, titles, URLs, notes, reviews, or other personal content. The tool rejects records containing extra keys such as `id` or `data`.

The report contains aggregate counts plus field-name frequency/coarse-type counts and categorical status frequencies: document counts, missing timestamps, missing required fields, unknown-field documents, invalid statuses, invalid timestamp metadata, and malformed input records. It intentionally excludes document IDs and all personal field values. Exit code 0 means no detected schema gaps in the supplied snapshot; exit code 1 means review is required; exit code 2 means invocation/input error.

**This is an inventory tool, not a migration tool.** It has no Firebase SDK dependency, credentials, network access, or write path. It does not infer old-to-new field mappings, change statuses, repair timestamps, or modify data. Unknown fields and historical statuses must be reviewed before a separately approved migration plan is authored.


The metadata-only contract is demonstrated in `docs/examples/legacy-collection-metadata.example.json`. Each record represents one document's field-name/type inventory plus an optional categorical status label; no actual field contents or document IDs should be exported.
