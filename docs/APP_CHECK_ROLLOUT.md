# DreamAndGo — App Check rollout для профилей (кандидат)

Статус: код только в PR #1; production не развернут. На 2026-11-15 Firestore закрыт emergency rules (по сообщению владельца).

## Защищённые методы

- `getPublicProfileV2`
- `findPublicProfileByUsernameV2`

Оба требуют Firebase Auth, App Check token (`enforceAppCheck: true`) и используют общий лимит 20 запросов на 60 секунд на UID в `profileLookupQuotas/{uid}`. Это **не** заменяет авторизацию и проверки прав. Server Admin SDK обходит Firestore Security Rules.

## Перед включением

1. В Firebase Console → App Check зарегистрировать веб-приложение `1:185825350373:web:749e60926a0c6294f7fa0c` с **reCAPTCHA Enterprise (Google Cloud Fraud Defense)**. Получить **публичный site key** (секретный ключ не копировать в репозиторий).
2. Инициализировать Web App Check SDK через `initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true })` перед вызовом Functions. Доступный ключ должен соответствовать зарегистрированному домену.
3. Проверить с двух реальных аккаунтов, что `httpsCallable` автоматически прикладывает App Check token; проверить негативный запрос без токена (должен быть отклонён) и превышение лимита.
4. До production-деплоя подготовить отдельное безопасное правило доступа к `users/{uid}` и закончить клиентский переход. Не заменять emergency `if false` открытыми правилами.
5. Запланировать staging и мониторинг метрик App Check, функции и квот; только после этого продвигать rollout.

## Важный нюанс

Пока App Check на клиенте не инициализирован, защищённые методы будут недоступны **даже авторизованным пользователям**. Поэтому не деплоить кандидатные Functions преждевременно и не включать UI флаг.

Для создания ключа перейти в Google Cloud Console → **Fraud Defense** → создать **Web / score-based** key для production-доменов приложения. Не включать checkbox challenge, не добавлять `localhost` к production-ключу, не отключать проверку домена. Зарегистрировать этот ключ для веб-приложения в Firebase Console → Security → App Check.\n\nОфициальная документация: https://firebase.google.com/docs/app-check/cloud-functions ; https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider .
