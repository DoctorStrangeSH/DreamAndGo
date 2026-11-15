import { normalizeUsername, isValidUsername } from '../js/core/username.js';

// Pure preflight: never include email, bio or other private profile fields
// in the resulting plan. Ambiguous legacy data MUST block all writes.
export function planUsernameBackfill(users, existingReservations = []) {
    if (!Array.isArray(users) || !Array.isArray(existingReservations)) {
        throw new TypeError('Expected arrays of users and reservations');
    }
    const candidates = new Map();
    const seenUsers = new Set();
    let invalid = 0;
    let collisions = 0;
    let duplicateIds = 0;
    for (const item of users) {
        const uid = item?.id;
        if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/') ||
            seenUsers.has(uid)) {
            duplicateIds++;
            continue;
        }
        seenUsers.add(uid);
        const display = item?.data?.username;
        if (typeof display !== 'string' || display !== display.trim() ||
            !isValidUsername(display)) {
            invalid++;
            continue;
        }
        const username = normalizeUsername(display);
        const previous = candidates.get(username);
        if (previous && previous.uid !== uid) {
            collisions++;
            continue;
        }
        candidates.set(username, { uid, username: display });
    }
    const reservations = new Map();
    let reservationConflicts = 0;
    for (const item of existingReservations) {
        const key = item?.id;
        const owner = item?.data?.uid;
        if (typeof key !== 'string' || !isValidUsername(key) ||
            normalizeUsername(key) !== key || typeof owner !== 'string' ||
            !owner || owner.length > 128 || owner.includes('/') || reservations.has(key)) {
            reservationConflicts++;
            continue;
        }
        reservations.set(key, owner);
        const candidate = candidates.get(key);
        if (!candidate || candidate.uid !== owner) reservationConflicts++;
    }
    const missing = [...candidates.entries()]
        .filter(([key]) => !reservations.has(key))
        .map(([key, value]) => ({ key, uid: value.uid, username: value.username }))
        .sort((a, b) => a.key.localeCompare(b.key));
    return {
        safe: invalid === 0 && collisions === 0 && duplicateIds === 0 &&
            reservationConflicts === 0 && candidates.size === seenUsers.size,
        userCount: users.length,
        uniqueCount: candidates.size,
        existingReservationCount: existingReservations.length,
        missing,
        invalidCount: invalid,
        collisionCount: collisions,
        duplicateIdCount: duplicateIds,
        reservationConflictCount: reservationConflicts
    };
}
