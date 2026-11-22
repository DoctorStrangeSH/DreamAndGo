import { normalizeUsername, isValidUsername } from '../js/core/username.js';

// Server-side only. The registry must be fully backfilled and independently
// audited before it can accept new reservations.
export async function registerProfileWithReservedUsername(
    db,
    uid,
    username,
    email,
    serverTimestamp
) {
    if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/') ||
        typeof username !== 'string' || username !== username.trim() ||
        !isValidUsername(username) || typeof email !== 'string' ||
        email.length > 320 || !email.trim() || !email.includes('@') ||
        typeof serverTimestamp !== 'function' ||
        !db || typeof db.collection !== 'function' ||
        typeof db.runTransaction !== 'function') {
        return { ok: false, code: 'invalid-argument' };
    }

    const canonical = normalizeUsername(username);
    const registry = db.collection('system').doc('usernameRegistry');
    const reservation = db.collection('usernameReservations').doc(canonical);
    const profile = db.collection('users').doc(uid);

    return db.runTransaction(async transaction => {
        // Firestore requires every transaction read to happen before writes.
        const [state, reserved, existingProfile] = await Promise.all([
            transaction.get(registry),
            transaction.get(reservation),
            transaction.get(profile)
        ]);

        const registryReady = state.exists === true &&
            state.get('ready') === true &&
            state.get('schemaVersion') === 1 &&
            state.get('legacyBackfillComplete') === true;

        if (!registryReady) {
            return { ok: false, code: 'failed-precondition' };
        }

        if (existingProfile.exists) {
            // Retry after an uncertain callable response: accept only the exact
            // profile/reservation pair already committed for this Auth UID.
            const sameProfile =
                existingProfile.get('usernameNormalized') === canonical &&
                normalizeUsername(existingProfile.get('username')) === canonical;
            const sameReservation = reserved.exists === true &&
                reserved.get('uid') === uid;

            if (sameProfile && sameReservation) {
                return { ok: true, username: canonical, recovered: true };
            }
            return { ok: false, code: 'already-exists' };
        }

        if (reserved.exists) {
            return { ok: false, code: 'already-exists' };
        }

        transaction.create(reservation, {
            uid,
            username,
            createdAt: serverTimestamp()
        });
        transaction.create(profile, {
            email,
            username,
            usernameNormalized: canonical,
            displayName: username,
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
            avatar: null,
            bio: '',
            location: '',
            website: '',
            stats: {
                travels: 0,
                restaurants: 0,
                movies: 0,
                books: 0,
                dreams: 0,
                friends: 0
            },
            achievements: [],
            friends: [],
            privacy: {
                travels: 'public',
                food: 'public',
                movies: 'public',
                books: 'public',
                dreams: 'public'
            },
            preferences: {
                theme: 'light',
                language: 'ru'
            }
        });

        return { ok: true, username: canonical };
    });
}
