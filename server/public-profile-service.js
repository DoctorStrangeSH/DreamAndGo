// Server-side public projection. Firestore users/{uid} contains private data
// (including email); never return or expose its raw document to other users.
const bounded = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const nonnegative = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function publicProfileFromPrivate(uid, source) {
    if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/') ||
        !source || typeof source !== 'object' || Array.isArray(source)) {
        return null;
    }
    const username = bounded(source.username, 40);
    const stats = source.stats && typeof source.stats === 'object' && !Array.isArray(source.stats)
        ? source.stats : {};
    const avatar = bounded(source.avatar, 2048);
    return Object.freeze({
        uid,
        username,
        displayName: bounded(source.displayName, 80) || username,
        avatar: /^https:\/\//i.test(avatar) ? avatar : '',
        bio: bounded(source.bio, 500),
        stats: Object.freeze({
            travels: nonnegative(stats.travels),
            restaurants: nonnegative(stats.restaurants),
            movies: nonnegative(stats.movies),
            books: nonnegative(stats.books),
            dreams: nonnegative(stats.dreams),
            friends: nonnegative(stats.friends)
        })
    });
}

export async function loadPublicProfile(db, actorUid, requestedUid) {
    if (typeof actorUid !== 'string' || !actorUid) return { ok: false, code: 'unauthenticated' };
    if (typeof requestedUid !== 'string' || !requestedUid || requestedUid.length > 128 ||
        requestedUid.includes('/')) return { ok: false, code: 'invalid-argument' };
    const snapshot = await db.collection('users').doc(requestedUid).get();
    if (!snapshot.exists) return { ok: false, code: 'not-found' };
    const profile = publicProfileFromPrivate(requestedUid, snapshot.data());
    if (!profile) return { ok: false, code: 'internal' };
    return { ok: true, profile };
}
