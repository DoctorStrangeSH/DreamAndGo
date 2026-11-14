#!/usr/bin/env node
/**
 * Run locally by an administrator after reviewing Firebase Security Rules.
 * Default: dry run. --apply only creates missing publicProfiles docs.
 * Does not delete or overwrite existing documents.
 */
import { toPublicProfile } from '../js/core/public-profile.js';

const args = process.argv.slice(2);
const projectIndex = args.indexOf('--project');
const projectId = projectIndex >= 0 ? args[projectIndex + 1] : '';
const apply = args.includes('--apply');
if (!projectId || projectId.startsWith('--') || (apply && !args.includes('--confirm-create-only'))) {
    console.error('Usage: node scripts/migrate-public-profiles.mjs --project PROJECT_ID [--apply --confirm-create-only]');
    process.exitCode = 2;
} else {
    try {
        const { initializeApp, applicationDefault } = await import('firebase-admin/app');
        const { getFirestore } = await import('firebase-admin/firestore');
        initializeApp({ credential: applicationDefault(), projectId });
        const database = getFirestore();
        const users = await database.collection('users').get();
        const candidates = [];
        const reservedNames = new Map();
        const conflicts = new Set();

        for (const item of users.docs) {
            const profile = toPublicProfile(item.id, item.data());
            if (!profile.usernameNormalized) continue;
            const existing = reservedNames.get(profile.usernameNormalized);
            if (existing && existing !== item.id) conflicts.add(profile.usernameNormalized);
            reservedNames.set(profile.usernameNormalized, item.id);
            candidates.push(profile);
        }

        console.log('Project:', projectId);
        console.log('Mode:', apply ? 'create missing only' : 'dry run');
        console.log('Profiles to inspect:', candidates.length);
        console.log('Username collision count:', conflicts.size);
        if (conflicts.size) {
            console.error('Username collisions detected; resolve them before migration.');
            process.exitCode = 1;
        } else {
            let created = 0;
            let skipped = 0;
            for (const profile of candidates) {
                const ref = database.collection('publicProfiles').doc(profile.uid);
                if (!apply) {
                    // No writes in dry run; avoid unnecessary reads of new collection.
                    continue;
                }
                try {
                    await ref.create(profile);
                    created++;
                } catch (error) {
                    if (error.code === 6 || error.code === 'already-exists') {
                        skipped++;
                    } else {
                        throw error;
                    }
                }
            }
            console.log(apply ? `Created: ${created}; existing left untouched: ${skipped}` : 'Dry run complete: no writes performed.');
        }
    } catch (error) {
        console.error('Migration failed:', error.message);
        process.exitCode = 1;
    }
}
