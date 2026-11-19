// The reCAPTCHA Enterprise site key is public browser configuration, not a secret.
// Keep App Check bootstrap isolated so a provider failure does not break Auth.
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
