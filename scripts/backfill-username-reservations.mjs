#!/usr/bin/env node
/**
 * Administrative migration tool; never changes users/{uid}.
 * Default is read-only. --apply still requires an explicit maintenance-window
 * acknowledgement and NEVER turns on the usernameRegistry ready flag.
 *
 * Requires Application Default Credentials in a trusted admin environment.
 * Do NOT add service-account JSON keys to the repository.
 */
import { planUsernameBackfill } from '../server/username-backfill-plan.js';

const argv = process.argv.slice(2);
const at = argv.indexOf('--project');
const projectId = at >= 0 ? argv[at + 1] : '';
const apply = argv.includes('--apply');
const confirmed = argv.includes('--confirm-registration-frozen');
const validProject = /^[a-z][a-z0-9-]{3,62}$/.test(projectId || '');
if (!validProject || (apply && !confirmed)) {
    console.error('Usage: node scripts/backfill-username-reservations.mjs --project PROJECT_ID [--apply --confirm-registration-frozen]');
    process.exitCode = 2;
} else {
    try {
        const { initializeApp, applicationDefault } = await import('firebase-admin/app');
        const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
        initializeApp({ credential: applicationDefault(), projectId });
        const db = getFirestore();
        const [users, reservations, control] = await Promise.all([
            db.collection('users').get(),
            db.collection('usernameReservations').get(),
            db.collection('system').doc('usernameRegistry').get()
        ]);
        if (control.exists && control.get('ready') === true) {
            throw new Error('Registry is already active; migration must not run while registrations are allowed.');
        }
        const plan = planUsernameBackfill(
            users.docs.map(snapshot => ({ id: snapshot.id, data: { username: snapshot.get('username') } })),
            reservations.docs.map(snapshot => ({ id: snapshot.id, data: { uid: snapshot.get('uid') } }))
        );
        // No usernames, emails, UIDs or other private fields are logged.
        console.log(JSON.stringify({
            projectId, mode: apply ? 'create-missing-only' : 'dry-run',
            userCount: plan.userCount, uniqueCount: plan.uniqueCount,
            existingReservations: plan.existingReservationCount,
            missingReservations: plan.missing.length,
            invalidCount: plan.invalidCount, collisionCount: plan.collisionCount,
            duplicateIdCount: plan.duplicateIdCount,
            reservationConflictCount: plan.reservationConflictCount,
            safe: plan.safe
        }, null, 2));
        if (!plan.safe) {
            throw new Error('Preflight blocked: resolve invalid usernames, collisions or reservation mismatches manually.');
        }
        if (!apply) {
            console.log('Read-only dry run complete. No documents written.');
        } else {
            let created = 0;
            let skipped = 0;
            for (const candidate of plan.missing) {
                const ref = db.collection('usernameReservations').doc(candidate.key);
                try {
                    await ref.create({
                        uid: candidate.uid, username: candidate.username,
                        createdAt: FieldValue.serverTimestamp()
                    });
                    created++;
                } catch (error) {
                    if (error.code !== 6 && error.code !== 'already-exists') throw error;
                    const current = await ref.get();
                    if (!current.exists || current.get('uid') !== candidate.uid) {
                        throw new Error('Reservation was created concurrently for a different user; stop and review.');
                    }
                    skipped++;
                }
            }
            // Verify every reservation again, including any concurrent conflicts.
            const [afterUsers, afterReservations] = await Promise.all([
                db.collection('users').get(),
                db.collection('usernameReservations').get()
            ]);
            const after = planUsernameBackfill(
                afterUsers.docs.map(snapshot => ({ id: snapshot.id, data: { username: snapshot.get('username') } })),
                afterReservations.docs.map(snapshot => ({ id: snapshot.id, data: { uid: snapshot.get('uid') } }))
            );
            if (!after.safe || after.missing.length ||
                after.userCount !== plan.userCount) {
                throw new Error('Postflight mismatch: registry NOT activated. Inspect changes and repeat dry run.');
            }
            console.log(JSON.stringify({ created, alreadyPresent: skipped, postflightVerified: true }));
            console.log('Registry remains CLOSED. Independent backup/audit and admin approval are still required.');
        }
    } catch (error) {
        console.error('Username migration stopped:', error.message);
        process.exitCode = 1;
    }
}
