# Dream&Go V1.0 — staging preflight (без доступа к production)

## Назначение

Перед проверкой двух реальных тестовых аккаунтов необходимо **отдельное Firebase staging-окружение**. Исходная веб-конфигурация в `js/config/firebase.js` указывает на **production** `dream-and-go`: её нельзя использовать для проверки рисковых миграций или записи тестовых данных.

`scripts/staging-preflight.mjs` — **локальная статическая проверка JSON**. Он ничего не деплоит, не подключается к Firebase, не читает реальные данные и не изменяет конфигурацию приложения.

## Подготовка (только отдельный staging)

1. Создать отдельный Firebase проект с `-staging` в ID и отдельное Web App. **Не создавать новые тестовые данные в `dream-and-go`.**
2. Подключить App Check (reCAPTCHA v3) к *staging* Web App и проверить настройки разрешённого тестового домена.
3. Создать **локальный игнорируемый Git-файл** `staging-config.local.json` (не коммитить, не вставлять ключи в сообщения).
4. Заполнить его публичной *staging* веб-конфигурацией из Firebase Console и отдельным App Check site key. Никаких service account JSON или закрытых ключей в этом файле быть не должно.
5. Запустить из корня репозитория: `node scripts/staging-preflight.mjs staging-config.local.json`. Получить `PASS` до начала дальнейшей приёмки.
6. Протестировать в **отдельной staging сборке**. Статическая проверка **не изменяет** `js/config/firebase.js` и **не включает** rollout flags.

Пример **схемы** файла (значения ниже — только заглушки, они не пройдут проверку):

```json
{
  "firebaseConfig": {
    "projectId": "your-project-staging",
    "apiKey": "YOUR_STAGING_WEB_API_KEY",
    "authDomain": "your-project-staging.firebaseapp.com",
    "appId": "YOUR_STAGING_WEB_APP_ID",
    "messagingSenderId": "YOUR_STAGING_SENDER_ID",
    "storageBucket": "your-project-staging.firebasestorage.app"
  },
  "appCheckSiteKey": "YOUR_STAGING_RECAPTCHA_SITE_KEY",
  "rolloutFlags": {
    "firebase-functions-backend-ready": false,
    "chat-v2-enabled": false,
    "signup-v2-enabled": false,
    "signup-v2-backend-ready": false,
    "signup-v2-legacy-migration-verified": false
  }
}
```

## Что проверяет preflight

- Идентификатор проекта соответствует отдельному `*-staging` проекту, не `dream-and-go` и не `demo-*`.
- Firebase `authDomain` принадлежит тому же staging project ID, web `appId`, `apiKey` и sender ID имеют ожидаемый формат.
- Отсутствуют ссылки на production storage bucket или production Realtime Database.
- Присутствует App Check site key в ожидаемом формате.
- Все пять rollout flags присутствуют и **строго** равны `false`.

## Что ещё обязательно до DONE

- [ ] Проверить actual staging Firebase project, Auth, App Check token exchange и HTTPS callable deployment (только staging).
- [ ] На двух независимых тестовых аккаунтах пройти регистрацию, вход, друзей, чаты, уведомления, блокировку и смену аккаунта.
- [ ] Проверить owner A / owner B / unrelated C / anonymous в Firestore Rules на staging.
- [ ] Проверить migration inventory, отдельный backup, независимый read-back и rollback rehearsal на **тестовых копиях**.
- [ ] Зафиксировать результаты, исходный commit, тестовые сценарии и ссылки на логи в `docs/RELEASE_READINESS.md`.
- [ ] Не открывать production rollout gates и не трогать `main` без отдельных релизных ворот и явного подтверждения.

Локальная проверка конфигурации **не заменяет** ни staging, ни безопасность App Check, ни двухаккаунтную приёмку.
