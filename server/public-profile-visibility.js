import { normalizeUsername, isValidUsername } from '../js/core/username.js';

// Visibility is owner-controlled through a callable, never a browser Firestore write.
// Enabling is gated on a completed username registry backfill so every public
// handle has a unique, reserved owner before it becomes discoverable.
export async function setPublicProfileVisibility(db, uid, enabled, serverTimestamp) {
    if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/') ||
        typeof enabled !== 'boolean' || typeof serverTimestamp !== 'function') {
        return { ok: false, code: 'invalid-argument' };
    }

    const userRef = db.collection('users').doc(uid);
    const registryRef = db.collection('system').doc('usernameRegistry');

    return db.runTransaction(async transaction => {
        const user = await transaction.get(userRef);
        if (!user.exists) return { ok: false, code: 'not-found' };

        if (!enabled) {
            transaction.update(userRef, {
                publicProfileEnabled: false,
                publicProfileUpdatedAt: serverTimestamp()
            });
            return { ok: true, enabled: false };
        }

        const registry = await transaction.get(registryRef);
        if (!registry.exists || registry.get('ready') !== true ||
            registry.get('schemaVersion') !== 1 ||
            registry.get('legacyBackfillComplete') !== true) {
            return { ok: false, code: 'failed-precondition' };
        }

        const username = user.get('username');
        const normalized = typeof username === 'string' ? normalizeUsername(username) : '';
        if (!isValidUsername(username) || !normalized ||
            user.get('usernameNormalized') !== normalized) {
            return { ok: false, code: 'failed-precondition' };
        }

        const reservationRef = db.collection('usernameReservations').doc(normalized);
        const reservation = await transaction.get(reservationRef);
        if (!reservation.exists || reservation.get('uid') !== uid) {
            return { ok: false, code: 'failed-precondition' };
        }

        transaction.update(userRef, {
            publicProfileEnabled: true,
            publicProfileUpdatedAt: serverTimestamp()
        });
        return { ok: true, enabled: true };
    });
}
