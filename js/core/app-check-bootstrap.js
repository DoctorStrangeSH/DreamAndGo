// App Check initialization is isolated so provider setup can fail without
// preventing Firebase Auth from initializing. The server still enforces App Check.
export function initializeWebAppCheck({ app, siteKey, initializeAppCheck, Provider }) {
    if (!app || typeof initializeAppCheck !== 'function' ||
        typeof Provider !== 'function' || typeof siteKey !== 'string' ||
        !/^[A-Za-z0-9_-]{20,128}$/.test(siteKey)) {
        throw new TypeError('Некорректная настройка App Check');
    }

    return initializeAppCheck(app, {
        provider: new Provider(siteKey),
        isTokenAutoRefreshEnabled: true
    });
}
