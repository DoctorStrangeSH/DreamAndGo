// Server-side public projection. Firestore users/{uid} contains private data
// (including email); never return or expose its raw document to other users.
const bounded = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const nonnegative = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function publicProfileFromPrivate(uid, source) {
    if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/') ||
        !source || typeof source !== 'object' || Array.isArray(source) ||
        source.publicProfileEnabled !== true) {
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
    if (!profile) return { ok: false, code: 'not-found' };
    return { ok: true, profile };
}

// Exact username lookup only. No prefix scans or bulk user enumeration.
// This is a candidate endpoint; enable only with App Check and request quotas.
export async function findPublicProfileByUsername(db, actorUid, username) {
    if (typeof actorUid !== 'string' || !actorUid) {
        return { ok: false, code: 'unauthenticated' };
    }
    if (typeof username !== 'string') return { ok: false, code: 'invalid-argument' };
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
        return { ok: false, code: 'invalid-argument' };
    }
    const users = db.collection('users');
    const indexed = await users.where('usernameNormalized', '==', normalized).limit(1).get();
    let document = indexed.docs[0];
    if (!document) {
        // Legacy profiles may lack the normalized field. Preserve exact-case
        // lookup without exposing raw documents in the callable result.
        const legacy = await users.where('username', '==', username.trim()).limit(1).get();
        document = legacy.docs[0];
    }
    if (!document) return { ok: true, profile: null };
    return { ok: true, profile: publicProfileFromPrivate(document.id, document.data()) };
}


// Bounded batch projection for friends and request lists. One callable/quota
// unit per screen load; private or missing accounts are omitted.
export async function loadPublicProfiles(db, actorUid, requestedUids) {
    if (typeof actorUid !== 'string' || !actorUid) {
        return { ok: false, code: 'unauthenticated' };
    }
    if (!Array.isArray(requestedUids) || requestedUids.length > 50 ||
        requestedUids.some(uid => typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/'))) {
        return { ok: false, code: 'invalid-argument' };
    }
    const uniqueUids = [...new Set(requestedUids)];
    if (uniqueUids.length === 0) return { ok: true, profiles: [] };
    const refs = uniqueUids.map(uid => db.collection('users').doc(uid));
    const snapshots = await db.getAll(...refs);
    const profiles = [];
    for (const snapshot of snapshots) {
        if (!snapshot.exists) continue;
        const profile = publicProfileFromPrivate(snapshot.id, snapshot.data());
        if (profile) profiles.push(profile);
    }
    return { ok: true, profiles };
}
