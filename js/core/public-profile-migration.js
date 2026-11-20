import { isValidUsername } from './username.js';
import { toPublicProfile } from './public-profile.js';

/** Pure, testable preflight. Username collisions are checked across all accounts;
 * only accounts with explicit public-profile consent enter the public projection.
 */
export function planPublicProfileMigration(records) {
    const profiles = [];
    const usernameOwners = new Map();
    const conflicts = new Set();
    let invalidCount = 0;
    let disabledCount = 0;
    for (const record of records || []) {
        const source = record?.data;
        if (!source || typeof source !== 'object' || Array.isArray(source)) {
            if (source?.publicProfileEnabled === true) invalidCount++;
            else disabledCount++;
            continue;
        }

        // Inspect normalized usernames across every account to detect collisions,
        // including private accounts that must never be copied to publicProfiles.
        const profile = toPublicProfile(record.id, { ...source, publicProfileEnabled: true });
        if (!profile || !profile.uid || !isValidUsername(profile.usernameNormalized)) {
            if (source.publicProfileEnabled === true) invalidCount++;
            else disabledCount++;
            continue;
        }

        const username = profile.usernameNormalized;
        const previousOwner = usernameOwners.get(username);
        if (previousOwner && previousOwner !== profile.uid) conflicts.add(username);
        usernameOwners.set(username, profile.uid);

        if (source.publicProfileEnabled !== true) {
            disabledCount++;
            continue;
        }
        profiles.push(profile);
    }
    return { profiles, conflictCount: conflicts.size, invalidCount, disabledCount };
}
