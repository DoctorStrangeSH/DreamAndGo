// Small, dependency-free helpers for values rendered into HTML or routes.
export function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

const INTERNAL_ROUTES = new Set([
    'travels', 'food', 'movies', 'books', 'dreams',
    'friends', 'chat', 'achievements', 'profile'
]);

export function safeInternalRoute(value) {
    if (typeof value !== 'string') return '';
    const route = value.trim().replace(/^#/, '');
    const match = route.match(/^([a-z]+)(?:\/([A-Za-z0-9_-]{1,128}))?$/);
    if (!match || !INTERNAL_ROUTES.has(match[1])) return '';
    if (match[2] && match[1] !== 'profile') return '';
    return match[2] ? `#profile/${match[2]}` : `#${match[1]}`;
}

export function safeIconClass(value, fallback = 'bi-bell') {
    return typeof value === 'string' && /^bi-[a-z0-9-]{1,64}$/.test(value)
        ? value
        : fallback;
}

export function safeDocumentId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
        ? value
        : '';
}

export function safeCount(value, max = 9999) {
    const count = Number(value);
    if (!Number.isFinite(count)) return 0;
    return Math.min(max, Math.max(0, Math.floor(count)));
}
