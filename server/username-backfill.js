import { planUsernameBackfill } from './username-backfill-plan.js';

const snapshotUsers = snapshots => snapshots.map(snapshot => ({
    id: snapshot.id,
    data: { username: snapshot.get('username') }
}));
const snapshotReservations = snapshots => snapshots.map(snapshot => ({
    id: snapshot.id,
    data: { uid: snapshot.get('uid') }
}));

/**
 * Rehearsable migration operation. Apply mode requires an explicit frozen
 * registration window; this helper never activates the registry.
 */
export async function runUsernameReservationBackfill(db, {
    apply = false,
    registrationFrozen = false,
    backupVerified = false,
    serverTimestamp,
    usersCollection = 'users',
    reservationsCollection = 'usernameReservations',
    registryCollection = 'system',
    registryDocument = 'usernameRegistry'
} = {}) {
    if (!db || typeof db.collection !== 'function') {
        throw new TypeError('A Firestore database is required');
    }
    if (apply && (!registrationFrozen || !backupVerified || typeof serverTimestamp !== 'function')) {
        throw new Error('Apply mode requires a verified backup, frozen registration window and server timestamp provider');
    }

    const registryRef = db.collection(registryCollection).doc(registryDocument);
    const [users, reservations, control] = await Promise.all([
        db.collection(usersCollection).get(),
        db.collection(reservationsCollection).get(),
        registryRef.get()
    ]);
    if (control.exists && control.get('ready') === true) {
        throw new Error('Registry is already active; migration must not run while registrations are allowed.');
    }

    const plan = planUsernameBackfill(
        snapshotUsers(users.docs),
        snapshotReservations(reservations.docs)
    );
    const summary = {
        mode: apply ? 'create-missing-only' : 'dry-run',
        userCount: plan.userCount,
        uniqueCount: plan.uniqueCount,
        existingReservations: plan.existingReservationCount,
        missingReservations: plan.missing.length,
        invalidCount: plan.invalidCount,
        collisionCount: plan.collisionCount,
        duplicateIdCount: plan.duplicateIdCount,
        reservationConflictCount: plan.reservationConflictCount,
        safe: plan.safe
    };

    if (!plan.safe) {
        return { ...summary, applied: false, reason: 'preflight-blocked' };
    }
    if (!apply) return { ...summary, applied: false, reason: 'dry-run' };

    let created = 0;
    let alreadyPresent = 0;
    for (const candidate of plan.missing) {
        const ref = db.collection(reservationsCollection).doc(candidate.key);
        try {
            await ref.create({
                uid: candidate.uid,
                username: candidate.username,
                createdAt: serverTimestamp()
            });
            created++;
        } catch (error) {
            if (error.code !== 6 && error.code !== 'already-exists') throw error;
            const current = await ref.get();
            if (!current.exists || current.get('uid') !== candidate.uid) {
                throw new Error('Reservation was created concurrently for a different user; stop and review.');
            }
            alreadyPresent++;
        }
    }

    const [afterUsers, afterReservations, afterControl] = await Promise.all([
        db.collection(usersCollection).get(),
        db.collection(reservationsCollection).get(),
        registryRef.get()
    ]);
    const after = planUsernameBackfill(
        snapshotUsers(afterUsers.docs),
        snapshotReservations(afterReservations.docs)
    );
    if (!after.safe || after.missing.length || after.userCount !== plan.userCount ||
        (afterControl.exists && afterControl.get('ready') === true)) {
        throw new Error('Postflight mismatch: registry NOT activated. Inspect changes and repeat dry run.');
    }

    return {
        ...summary,
        created,
        alreadyPresent,
        postflightVerified: true,
        registryActivated: false,
        applied: true
    };
}
