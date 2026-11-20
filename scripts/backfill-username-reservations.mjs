#!/usr/bin/env node
/**
 * Administrative migration tool; never changes users/{uid}.
 * Default is read-only. --apply requires a maintenance-window acknowledgement
 * and NEVER turns on the usernameRegistry ready flag.
 *
 * Requires Application Default Credentials in a trusted admin environment.
 * Do NOT add service-account JSON keys to the repository.
 */
import { runUsernameReservationBackfill } from '../server/username-backfill.js';

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
        const result = await runUsernameReservationBackfill(getFirestore(), {
            apply,
            registrationFrozen: confirmed,
            serverTimestamp: () => FieldValue.serverTimestamp()
        });
        // Only aggregate counters are logged; never expose usernames, emails or UIDs.
        console.log(JSON.stringify({ projectId, ...result }, null, 2));
        if (result.reason === 'preflight-blocked') {
            throw new Error('Preflight blocked: resolve invalid usernames, collisions or reservation mismatches manually.');
        }
        if (result.postflightVerified) {
            console.log('Registry remains CLOSED. Independent backup/audit and admin approval are still required.');
        } else if (!apply) {
            console.log('Read-only dry run complete. No documents written.');
        }
    } catch (error) {
        console.error('Username migration stopped:', error.message);
        process.exitCode = 1;
    }
}
