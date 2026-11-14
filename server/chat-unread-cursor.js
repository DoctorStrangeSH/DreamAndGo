// Candidate v2 contract: every server-created message must carry a strictly increasing
// integer sequence within its chat. The per-user cursor is shared by all devices.
export function validateReadCursor(value) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError('Read cursor must be a non-negative safe integer');
    }
    return value;
}

export function advanceReadCursor(currentCursor, observedSequence) {
    const current = validateReadCursor(currentCursor);
    const observed = validateReadCursor(observedSequence);
    return Math.max(current, observed);
}

export function countUnreadIncoming(messages, currentUserId, readCursor) {
    validateReadCursor(readCursor);
    if (typeof currentUserId !== 'string' || !currentUserId) {
        throw new TypeError('A current user is required');
    }
    if (!Array.isArray(messages)) throw new TypeError('Messages must be an array');
    return messages.reduce((count, message) => {
        if (!message || !Number.isSafeInteger(message.sequence) || message.sequence < 1) {
            throw new TypeError('Every message must have a valid server sequence');
        }
        return count + (message.senderId !== currentUserId && message.sequence > readCursor ? 1 : 0);
    }, 0);
}

// A cursor is monotonic: an older device snapshot can never move it backwards.
export function mergeReadCursor(localCursor, remoteCursor) {
    return advanceReadCursor(localCursor, remoteCursor);
}
