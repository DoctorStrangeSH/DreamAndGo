import { createHash } from 'node:crypto';

export function isValidUserId(value) {
    return typeof value === 'string' && value.length > 0 &&
        value.length <= 128 && value.trim() === value && !value.includes('/');
}

export function isValidDocumentId(value, maxLength = 128) {
    return typeof value === 'string' && value.length > 0 &&
        value.length <= maxLength && value.trim() === value && !value.includes('/');
}

export function normalizeChatMessage(value) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text.length > 0 && text.length <= 2000 ? text : null;
}

export function otherChatParticipant(participants, uid) {
    if (!Array.isArray(participants) || participants.length !== 2 ||
        !isValidUserId(uid) ||
        !participants.every(isValidUserId) ||
        participants[0] === participants[1] ||
        !participants.includes(uid)) return null;
    return participants.find(x => x !== uid);
}

export function normalizeClientMessageId(value) {
    if (typeof value !== 'string') return null;
    // A fresh UUID for each user action; retrying that action must reuse it.
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
        ? value.toLowerCase() : null;
}

export function serverMessageDocumentId(chatId, senderId, clientMessageId) {
    if (!isValidDocumentId(chatId) ||
        !isValidUserId(senderId) ||
        !normalizeClientMessageId(clientMessageId)) return null;
    const fields = [chatId, senderId, clientMessageId.toLowerCase()];
    const framed = fields.map(value => `${Buffer.byteLength(value, 'utf8')}:${value}`).join('');
    return createHash('sha256').update(framed).digest('hex');
}
