# DreamAndGo — App Check rollout для профилей (кандидат)

Статус: клиентский bootstrap уже реализован в `js/config/firebase.js` и `js/core/app-check-bootstrap.js`; production Functions/Rules rollout не подтверждён. На 2026-11-21 фактический App Check enforcement и browser token flow ещё не проверены на staging.

## Защищённые методы

- `getPublicProfileV2`
- `findPublicProfileByUsernameV2`

Оба требуют Firebase Auth, App Check token (`enforceAppCheck: true`) и используют общий лимит 20 запросов на 60 секунд на UID в `profileLookupQuotas/{uid}`. Это **не** заменяет авторизацию и проверки прав. Server Admin SDK обходит Firestore Security Rules.

## Перед включением

1. **Проверить в Firebase Console** регистрацию веб-приложения `1:185825350373:web:749e60926a0c6294f7fa0c` с **reCAPTCHA Enterprise (Google Cloud Fraud Defense)** и соответствие публичного site key доменам. В коде уже задан публичный ключ; секретный ключ в репозиторий не добавлять.
2. **Выполнено в коде:** `js/config/firebase.js` вызывает `initializeWebAppCheck(...)` при создании Firebase app; bootstrap использует `ReCaptchaEnterpriseProvider` и `isTokenAutoRefreshEnabled: true`. Импорт Firebase config происходит до вызовов callable. Остаётся подтвердить успешное получение токена в браузере на реальном staging-домене.
3. Проверить с двух реальных аккаунтов, что `httpsCallable` автоматически прикладывает App Check token; проверить негативный запрос без токена (должен быть отклонён) и превышение лимита.
4. До production-деплоя подготовить отдельное безопасное правило доступа к `users/{uid}` и закончить клиентский переход. Не заменять emergency `if false` открытыми правилами.
5. Запланировать staging и мониторинг метрик App Check, функции и квот; только после этого продвигать rollout.

## Важный нюанс

Клиентский App Check bootstrap в репозитории присутствует, но это не доказывает, что site key зарегистрирован для текущего домена, App Check включён для нужного Firebase App и enforcement корректно работает на сервере. Пока не выполнен browser staging test, защищённые callable нельзя считать готовыми для пользователей. Не деплоить кандидатные Functions преждевременно и не включать UI rollout flags.

Для создания ключа перейти в Google Cloud Console → **Fraud Defense** → создать **Web / score-based** key для production-доменов приложения. Не включать checkbox challenge, не добавлять `localhost` к production-ключу, не отключать проверку домена. Зарегистрировать этот ключ для веб-приложения в Firebase Console → Security → App Check.\n\nОфициальная документация: https://firebase.google.com/docs/app-check/cloud-functions ; https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider .


## Проверка кода — 2026-11-21

- [x] `js/config/firebase.js` импортирует `initializeAppCheck` и `ReCaptchaEnterpriseProvider`.
- [x] Публичный site key передаётся в `initializeWebAppCheck`; bootstrap включает автообновление токена.
- [x] Все проверенные callable endpoints в `server/index.js` используют `enforceAppCheck: true`.
- [ ] Подтвердить Firebase Console: зарегистрированное приложение, production/staging domains и enforcement settings.
- [ ] В настоящем браузере проверить получение токена, успешный callable с токеном и отказ без токена.
- [ ] Проверить quota/rate-limit сценарии и логи функций на staging.

**Исправление документации:** прежнее утверждение «App Check на клиенте не инициализирован» устарело. Инициализация уже присутствует в коде; не подтверждён именно runtime/Console rollout.
