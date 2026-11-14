export function normalizeChatMessage(value) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text.length > 0 && text.length <= 2000 ? text : null;
}

export function otherChatParticipant(participants, uid) {
    if (!Array.isArray(participants) || participants.length !== 2 ||
        typeof uid !== 'string' || !uid ||
        !participants.every(x => typeof x === 'string' && Boolean(x)) ||
        participants[0] === participants[1] ||
        !participants.includes(uid)) return null;
    return participants.find(x => x !== uid);
}
