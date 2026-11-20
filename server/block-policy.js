// Candidate v2 policy: either user's block record denies communication.
// Firestore snapshots must be well-formed. Missing/malformed snapshots fail closed.
export function isConversationBlocked(senderBlock, recipientBlock) {
    if (!senderBlock || typeof senderBlock.exists !== 'boolean' ||
        !recipientBlock || typeof recipientBlock.exists !== 'boolean') {
        return true;
    }
    return senderBlock.exists || recipientBlock.exists;
}
