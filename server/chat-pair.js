import { createHash } from 'node:crypto';

// A stable, opaque pair index for trusted server code. Never use the legacy
// sorted-UIDs-with-underscore path, which is ambiguous for some UID values.
export function conversationPairKey(firstUid, secondUid) {
    if (typeof firstUid !== 'string' || typeof secondUid !== 'string' ||
        !firstUid || !secondUid || firstUid === secondUid) {
        throw new TypeError('Expected two distinct non-empty Firebase UIDs');
    }
    const sorted = [firstUid, secondUid].sort();
    const framed = sorted.map(uid => {
        const bytes = Buffer.from(uid, 'utf8');
        return `${bytes.length}:${uid}`;
    }).join('');
    return 'v2_' + createHash('sha256').update(framed, 'utf8').digest('hex');
}
