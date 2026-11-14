import { isValidUsername } from './username.js';
import { toPublicProfile } from './public-profile.js';

/** Pure, testable preflight. Legacy collisions or invalid usernames block writes. */
export function planPublicProfileMigration(records) {
    const profiles = [];
    const usernameOwners = new Map();
    const conflicts = new Set();
    let invalidCount = 0;
    for (const record of records || []) {
        const profile = toPublicProfile(record.id, record.data);
        const username = profile.usernameNormalized;
        if (!profile.uid || !isValidUsername(username)) {
            invalidCount++;
            continue;
        }
        const previousOwner = usernameOwners.get(username);
        if (previousOwner && previousOwner !== profile.uid) conflicts.add(username);
        usernameOwners.set(username, profile.uid);
        profiles.push(profile);
    }
    return { profiles, conflictCount: conflicts.size, invalidCount };
}
