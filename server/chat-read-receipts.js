import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { isConversationBlocked } from './block-policy.js';
import { otherChatParticipant, serverMessageDocumentId } from './message-policy.js';

// Candidate v2 only. A read receipt is written exclusively by the actual recipient.
// The message ID is deterministic and bound to chat, original sender and client UUID.
export async function markPrivateMessageReadTransaction(db, uid, chatId, messageId) {
    if (typeof uid !== 'string' || !uid) {
        throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    }
    if (typeof chatId !== 'string' || !chatId || chatId.length > 128 || chatId.includes('/') ||
        typeof messageId !== 'string' || !/^[a-f0-9]{64}$/.test(messageId)) {
        throw new HttpsError('invalid-argument', 'Некорректное сообщение');
    }
    const chatRef = db.collection('chats').doc(chatId);
    const messageRef = chatRef.collection('messages').doc(messageId);
    return db.runTransaction(async tx => {
        const chat = await tx.get(chatRef);
        if (!chat.exists || chat.get('version') !== 2) {
            throw new HttpsError('failed-precondition', 'Диалог недоступен');
        }
        const partnerId = otherChatParticipant(chat.get('participants'), uid);
        if (!partnerId) throw new HttpsError('permission-denied', 'Нет доступа к переписке');
        const recipientPreviewRef = db.collection('users').doc(uid).collection('chats').doc(partnerId);
        const [message, senderBlock, recipientBlock, recipientPreview] = await Promise.all([
            tx.get(messageRef),
            tx.get(db.collection('users').doc(uid).collection('blockedUsers').doc(partnerId)),
            tx.get(db.collection('users').doc(partnerId).collection('blockedUsers').doc(uid)),
            tx.get(recipientPreviewRef)
        ]);
        if (isConversationBlocked(senderBlock, recipientBlock)) {
            throw new HttpsError('permission-denied', 'Общение с пользователем недоступно');
        }
        if (!message.exists) throw new HttpsError('not-found', 'Сообщение не найдено');
        const senderId = message.get('senderId');
        const clientMessageId = message.get('clientMessageId');
        if (senderId !== partnerId || serverMessageDocumentId(chatId, senderId, clientMessageId) !== messageId) {
            throw new HttpsError('permission-denied', 'Нет доступа к подтверждению');
        }
        if (message.get('read') === true) return { status: 'read', messageId };
        // A frozen chat must not change while a backup or rollback is being checked.
        if (chat.get('state') !== 'active') {
            throw new HttpsError('failed-precondition', 'Диалог временно недоступен');
        }
        // A receipt acknowledges exactly one message, never all earlier messages.
        // Guard the materialized counter against duplicates, missing previews and
        // historical mismatches; do not let an unread count become negative.
        if (recipientPreview.exists) {
            const unread = recipientPreview.get('unread');
            if (Number.isSafeInteger(unread) && unread > 0) {
                tx.update(recipientPreviewRef, { unread: unread - 1 });
            }
        }
        tx.update(messageRef, { read: true, readAt: FieldValue.serverTimestamp() });
        return { status: 'read', messageId };
    });
}
