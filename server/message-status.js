import { HttpsError } from 'firebase-functions/v2/https';
import { isConversationBlocked } from './block-policy.js';
import { isValidUserId, isValidDocumentId, normalizeClientMessageId, otherChatParticipant, serverMessageDocumentId } from './message-policy.js';

// Read-only candidate v2 reconciliation. Never returns message text or recipient data.
export async function getPrivateMessageStatus(db, uid, chatId, clientMessageId) {
    const normalizedId = normalizeClientMessageId(clientMessageId);
    if (!isValidUserId(uid)) {
        throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    }
    if (!isValidDocumentId(chatId) || !normalizedId) {
        throw new HttpsError('invalid-argument', 'Некорректный идентификатор сообщения');
    }
    const chatRef = db.collection('chats').doc(chatId);
    const chat = await chatRef.get();
    if (!chat.exists || chat.get('version') !== 2) {
        throw new HttpsError('failed-precondition', 'Диалог недоступен');
    }
    const partnerId = otherChatParticipant(chat.get('participants'), uid);
    if (!partnerId) {
        throw new HttpsError('permission-denied', 'Нет доступа к переписке');
    }
    const [senderBlock, recipientBlock] = await Promise.all([
        db.collection('users').doc(uid).collection('blockedUsers').doc(partnerId).get(),
        db.collection('users').doc(partnerId).collection('blockedUsers').doc(uid).get()
    ]);
    if (isConversationBlocked(senderBlock, recipientBlock)) {
        throw new HttpsError('permission-denied', 'Общение с пользователем недоступно');
    }
    const messageId = serverMessageDocumentId(chatId, uid, normalizedId);
    const message = await chatRef.collection('messages').doc(messageId).get();
    if (!message.exists) return { status: 'missing' };
    if (message.get('senderId') !== uid || message.get('clientMessageId') !== normalizedId) {
        throw new HttpsError('failed-precondition', 'Повреждён идентификатор сообщения');
    }
    return { status: 'sent', messageId, read: message.get('read') === true };
}
