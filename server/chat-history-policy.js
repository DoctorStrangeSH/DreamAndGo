import { otherChatParticipant } from './message-policy.js';
import { isConversationBlocked } from './block-policy.js';

// Pure policy for a future authenticated v2 history callable. No database IO.
// The Firestore adapter must read the chat and both block records before querying
// any message documents, and must never trust a client-supplied sender ID.
export function normalizeHistoryRequest(uid, data) {
    if (typeof uid !== 'string' || !uid) {
        return { ok: false, code: 'unauthenticated' };
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        typeof data.chatId !== 'string' || !data.chatId ||
        data.chatId.length > 128 || data.chatId.includes('/') ||
        (data.beforeSequence != null &&
            (!Number.isSafeInteger(data.beforeSequence) || data.beforeSequence <= 0)) ||
        !Number.isSafeInteger(data.limit) || data.limit < 1 || data.limit > 50) {
        return { ok: false, code: 'invalid-argument' };
    }
    return {
        ok: true, chatId: data.chatId,
        beforeSequence: data.beforeSequence ?? null,
        limit: data.limit
    };
}

export function authorizeHistoryChat(chat, uid, myBlock, peerBlock) {
    if (!chat || chat.version !== 2 || chat.state !== 'active') {
        return { ok: false, code: 'failed-precondition' };
    }
    const partnerId = otherChatParticipant(chat.participants, uid);
    if (!partnerId) return { ok: false, code: 'permission-denied' };
    if (isConversationBlocked(myBlock, peerBlock)) {
        return { ok: false, code: 'permission-denied' };
    }
    return { ok: true, partnerId };
}

// Rows must already be fetched in strictly descending sequence order with a
// hard query limit of requestedLimit + 1. The extra row proves hasMore.
export function buildHistoryPage(chatId, rows, beforeSequence, requestedLimit) {
    const request = normalizeHistoryRequest('internal', { chatId, beforeSequence, limit: requestedLimit });
    if (!request.ok || !Array.isArray(rows) || rows.length > requestedLimit + 1) {
        throw new TypeError('Некорректная страница истории');
    }
    let previous = beforeSequence ?? Number.MAX_SAFE_INTEGER;
    const seen = new Set();
    const normalized = rows.map(row => {
        if (!row || typeof row.id !== 'string' || !/^[a-f0-9]{64}$/.test(row.id) ||
            seen.has(row.id) || !Number.isSafeInteger(row.sequence) ||
            row.sequence <= 0 || row.sequence >= previous ||
            typeof row.senderId !== 'string' || !row.senderId ||
            typeof row.text !== 'string' || !row.text.trim() || row.text.length > 2000 ||
            typeof row.read !== 'boolean') {
            throw new TypeError('Повреждённая страница истории');
        }
        previous = row.sequence;
        seen.add(row.id);
        return {
            id: row.id, sequence: row.sequence, senderId: row.senderId,
            text: row.text, read: row.read
        };
    });
    const hasMore = normalized.length > requestedLimit;
    const messages = normalized.slice(0, requestedLimit);
    return {
        chatId, messages, hasMore,
        nextBeforeSequence: hasMore ? messages.at(-1).sequence : null
    };
}
