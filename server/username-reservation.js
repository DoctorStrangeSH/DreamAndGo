import { normalizeUsername, isValidUsername } from '../js/core/username.js';

// Candidate signup operation; never enable until the username registry is
// backfilled from every existing users/{uid} profile and independently audited.
// Registry control document must be writable by administrators only.
export async function registerProfileWithReservedUsername(db, uid, username, email, serverTimestamp) {
    if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/') ||
        typeof username !== 'string' || username !== username.trim() ||
        !isValidUsername(username) || typeof email !== 'string' || email.length > 320 ||
        !email.includes('@') || typeof serverTimestamp !== 'function') {
        return { ok: false, code: 'invalid-argument' };
    }
    const canonical = normalizeUsername(username);
    const registry = db.collection('system').doc('usernameRegistry');
    const reservation = db.collection('usernameReservations').doc(canonical);
    const profile = db.collection('users').doc(uid);

    return db.runTransaction(async transaction => {
        // All reads must precede any transaction writes.
        const [state, reserved, existingProfile] = await Promise.all([
            transaction.get(registry), transaction.get(reservation), transaction.get(profile)
        ]);
        if (!state.exists || state.get('ready') !== true ||
            state.get('schemaVersion') !== 1 ||
            state.get('legacyBackfillComplete') !== true) {
            return { ok: false, code: 'failed-precondition' };
        }
        if (existingProfile.exists) {
            // Do not overwrite old accounts, even after a retry.
            return { ok: false, code: 'already-exists' };
        }
        if (reserved.exists) return { ok: false, code: 'already-exists' };

        transaction.create(reservation, {
            uid, username, createdAt: serverTimestamp()
        });
        transaction.create(profile, {
            email, username, usernameNormalized: canonical, displayName: username,
            createdAt: serverTimestamp(), lastLogin: serverTimestamp(),
            avatar: null, bio: '', location: '', website: '',
            stats: { travels: 0, restaurants: 0, movies: 0, books: 0, dreams: 0, friends: 0 },
            achievements: [], friends: [],
            privacy: {
                travels: 'public', food: 'public', movies: 'public',
                books: 'public', dreams: 'public'
            },
            preferences: { theme: 'light', language: 'ru' }
        });
        return { ok: true, username: canonical };
    });
}
