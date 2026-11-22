import { isValidUsername, normalizeUsername } from '../js/core/username.js';

const PUBLIC_TEXT_LIMITS = Object.freeze({
    displayName: 80,
    bio: 500,
    location: 100
});

const PUBLIC_STAT_VISIBILITY = Object.freeze({
    travels: 'travels',
    restaurants: 'food',
    movies: 'movies',
    books: 'books',
    dreams: 'dreams'
});

function boundedText(value, maxLength) {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
}

function safeHttpsUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password) return null;
        return url.href.slice(0, 2048);
    } catch {
        return null;
    }
}

function safeCount(value) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        return 0;
    }
    return value;
}

/**
 * Build the explicitly public, allowlisted profile projection.
 *
 * Missing/unknown privacy preferences fail closed. This is a data-shaping
 * helper only; callers must still authenticate, authorize the owner and
 * write the projection through trusted server code.
 */
export function buildPublicProfile(uid, userData) {
    if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/') ||
        !userData || typeof userData !== 'object' || Array.isArray(userData)) {
        throw new TypeError('Некорректные данные публичного профиля');
    }

    const username = typeof userData.username === 'string' ? userData.username : '';
    if (!isValidUsername(username)) {
        throw new TypeError('Публичный профиль требует корректный никнейм');
    }

    const privacy = userData.privacy && typeof userData.privacy === 'object'
        ? userData.privacy
        : {};
    // A public profile requires a separate explicit opt-in. Legacy category
    // defaults (some historically set to `public`) are not proof of consent.
    if (privacy.profile !== 'public') return null;

    const sourceStats = userData.stats && typeof userData.stats === 'object'
        ? userData.stats
        : {};

    const stats = {};
    for (const [stat, preference] of Object.entries(PUBLIC_STAT_VISIBILITY)) {
        if (privacy[preference] === 'public') {
            stats[stat] = safeCount(sourceStats[stat]);
        }
    }

    const projection = {
        uid,
        username: normalizeUsername(username),
        displayName: boundedText(userData.displayName, PUBLIC_TEXT_LIMITS.displayName),
        avatar: safeHttpsUrl(userData.avatar),
        bio: boundedText(userData.bio, PUBLIC_TEXT_LIMITS.bio),
        location: boundedText(userData.location, PUBLIC_TEXT_LIMITS.location),
        website: safeHttpsUrl(userData.website),
        stats
    };

    // createdAt is safe to expose only when it is a Firestore Timestamp or
    // an ISO date string. Do not copy arbitrary client-controlled objects.
    if (userData.createdAt &&
        typeof userData.createdAt.toDate === 'function' &&
        Number.isFinite(userData.createdAt.toDate().getTime())) {
        projection.createdAt = userData.createdAt;
    } else if (typeof userData.createdAt === 'string' &&
        Number.isFinite(Date.parse(userData.createdAt))) {
        projection.createdAt = new Date(userData.createdAt).toISOString();
    }

    return projection;
}
