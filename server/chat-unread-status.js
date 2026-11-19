import { HttpsError } from 'firebase-functions/v2/https';
import { isConversationBlocked } from './block-policy.js';
import { isValidUserId, isValidDocumentId, otherChatParticipant } from './message-policy.js';

// Candidate v2 read-only source of truth. Count only incoming, individually
// unread messages; a device-local cursor or materialized preview may be stale.
// Requires the candidate composite index described in the protocol docs.
export async function getPrivateChatUnreadCount(db, uid, chatId) {
    if (!isValidUserId(uid)) {
        throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    }
    if (!isValidDocumentId(chatId)) {
        throw new HttpsError('invalid-argument', 'Некорректный диалог');
    }
    const chatRef = db.collection('chats').doc(chatId);
    const chat = await chatRef.get();
    if (!chat.exists || chat.get('version') !== 2) {
        throw new HttpsError('failed-precondition', 'Диалог недоступен');
    }
    const partnerId = otherChatParticipant(chat.get('participants'), uid);
    if (!partnerId) throw new HttpsError('permission-denied', 'Нет доступа к переписке');
    const [mine, theirs] = await Promise.all([
        db.collection('users').doc(uid).collection('blockedUsers').doc(partnerId).get(),
        db.collection('users').doc(partnerId).collection('blockedUsers').doc(uid).get()
    ]);
    if (isConversationBlocked(mine, theirs)) {
        throw new HttpsError('permission-denied', 'Общение с пользователем недоступно');
    }
    const aggregate = await chatRef.collection('messages')
        .where('senderId', '==', partnerId)
        .where('read', '==', false)
        .count().get();
    const unread = aggregate.data().count;
    if (!Number.isSafeInteger(unread) || unread < 0) {
        throw new HttpsError('internal', 'Не удалось проверить непрочитанные');
    }
    return { chatId, unread };
}
