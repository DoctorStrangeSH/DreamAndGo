// Candidate v2 policy: presence of either user's block record denies communication.
// This schema is not yet exposed to the client or protected by production rules.
export function isConversationBlocked(senderBlock, recipientBlock) {
    return senderBlock?.exists !== false || recipientBlock?.exists !== false;
}
