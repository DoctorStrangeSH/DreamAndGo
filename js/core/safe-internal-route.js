/**
 * Allow only application-owned hash routes before using persisted notification/search data.
 * Dynamic profile identifiers are constrained to Firebase Auth UID-safe characters.
 */
export function safeInternalRoute(value, allowedRoutes = []) {
    const route = String(value ?? '').trim();
    if (allowedRoutes.includes(route)) return route;

    if (allowedRoutes.includes('#profile/:uid')) {
        const profileMatch = route.match(/^#profile\/([A-Za-z0-9_-]{1,128})$/);
        if (profileMatch) return `#profile/${profileMatch[1]}`;
    }

    return '';
}
