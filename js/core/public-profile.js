import { normalizeUsername } from './username.js';
import { safeAvatarURL } from './safe-avatar-url.js';

// Explicit allowlist: never spread raw Firestore user data into a public view.
// This projection does not itself enforce database read permissions.
export function toPublicProfile(uid, source = {}) {
    const data = source && typeof source === 'object' ? source : {};
    const username = typeof data.username === 'string' ? data.username.trim().slice(0, 40) : '';
    const displayName = typeof data.displayName === 'string' && data.displayName.trim()
        ? data.displayName.trim().slice(0, 80)
        : username;
    const rawStats = data.stats && typeof data.stats === 'object' ? data.stats : {};
    const count = (key) => Number.isSafeInteger(rawStats[key]) && rawStats[key] >= 0 ? rawStats[key] : 0;
    return {
        uid: String(uid || ''),
        username,
        usernameNormalized: normalizeUsername(username),
        displayName,
        avatar: safeAvatarURL(data.avatar),
        bio: typeof data.bio === 'string' ? data.bio.slice(0, 500) : '',
        stats: {
            travels: count('travels'),
            restaurants: count('restaurants'),
            movies: count('movies'),
            books: count('books'),
            dreams: count('dreams'),
            friends: count('friends')
        }
    };
}
