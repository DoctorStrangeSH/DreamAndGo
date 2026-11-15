import {
    normalizeHistoryRequest, authorizeHistoryChat, buildHistoryPage
} from './chat-history-policy.js';
import { otherChatParticipant } from './message-policy.js';

// Edition-neutral orchestration. The Firestore-specific adapter is intentionally
// separate: no message reads may happen before membership and block checks.
// The adapter must return at most limit+1 records, newest sequence first.
export async function loadPrivateChatHistory(uid, data, adapter) {
    const input = normalizeHistoryRequest(uid, data);
    if (!input.ok) return input;
    if (!adapter || typeof adapter.getChat !== 'function' ||
        typeof adapter.getBlock !== 'function' ||
        typeof adapter.listMessages !== 'function') {
        throw new TypeError('Не настроен источник истории');
    }

    const chat = await adapter.getChat(input.chatId);
    if (!chat || chat.version !== 2 || chat.state !== 'active') {
        return { ok: false, code: 'failed-precondition' };
    }
    const partnerId = otherChatParticipant(chat.participants, uid);
    if (!partnerId) return { ok: false, code: 'permission-denied' };

    const [mine, theirs] = await Promise.all([
        adapter.getBlock(uid, partnerId),
        adapter.getBlock(partnerId, uid)
    ]);
    const access = authorizeHistoryChat(chat, uid, mine, theirs);
    if (!access.ok) return access;

    const rows = await adapter.listMessages(input.chatId, {
        beforeSequence: input.beforeSequence,
        limit: input.limit + 1
    });
    return {
        ok: true,
        ...buildHistoryPage(input.chatId, rows, input.beforeSequence, input.limit)
    };
}
