import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { isConversationBlocked } from './block-policy.js';
import { canSendChatMessage } from './rate-policy.js';
import { otherChatParticipant, serverMessageDocumentId } from './message-policy.js';

// Shared implementation for the callable wrapper and Firestore emulator tests.
// Call only with an already authenticated sender and validated message fields.
export async function sendPrivateMessageTransaction(db, uid, chatId, text, clientMessageId, now = Date.now) {
    const chatRef = db.collection('chats').doc(chatId);
    const messageId = serverMessageDocumentId(chatId, uid, clientMessageId);
    const messageRef = chatRef.collection('messages').doc(messageId);
    // Shared across all conversations for this sender; client cannot select it.
    const cooldownRef = db.collection('users').doc(uid).collection('privateChatLimits').doc('send');

    await db.runTransaction(async tx => {
        // Firestore requires all reads before any writes. Reading the deterministic
        // message document also serializes concurrent retries of the same request.
        const snapshot = await tx.get(chatRef);
        const priorMessage = await tx.get(messageRef);
        if (!snapshot.exists || snapshot.get('version') !== 2) {
            throw new HttpsError('failed-precondition', 'Диалог недоступен');
        }
        const partnerId = otherChatParticipant(snapshot.get('participants'), uid);
        if (!partnerId) throw new HttpsError('permission-denied', 'Нет доступа к переписке');
        const [senderBlock, recipientBlock] = await Promise.all([
            tx.get(db.collection('users').doc(uid).collection('blockedUsers').doc(partnerId)),
            tx.get(db.collection('users').doc(partnerId).collection('blockedUsers').doc(uid))
        ]);
        if (isConversationBlocked(senderBlock, recipientBlock)) {
            throw new HttpsError('permission-denied', 'Общение с пользователем недоступно');
        }
        if (priorMessage.exists) {
            // A genuine network retry must not consume the cooldown or unread count.
            if (priorMessage.get('senderId') !== uid || priorMessage.get('text') !== text ||
                priorMessage.get('clientMessageId') !== clientMessageId) {
                throw new HttpsError('already-exists', 'Идентификатор сообщения уже использован');
            }
            return;
        }

        // A frozen chat may acknowledge an identical prior retry, but never create a new message.
        if (snapshot.get('state') !== 'active') {
            throw new HttpsError('failed-precondition', 'Диалог временно недоступен для отправки');
        }

        // Read the user's global cooldown record before any transaction writes.
        // Concurrent sends to different chats contend on this one document.
        const cooldownSnapshot = await tx.get(cooldownRef);
        const nowMillis = now();
        const lastSentAt = cooldownSnapshot.exists ? cooldownSnapshot.get('lastSentAt') : null;
        if (!canSendChatMessage(lastSentAt, nowMillis)) {
            throw new HttpsError('resource-exhausted', 'Слишком частая отправка сообщений. Подожди немного.');
        }

        // The chat document is the serialization point for sequence issuance.
        // Old v2 chats without a counter start at zero; malformed counters fail closed.
        const lastSequence = snapshot.get('nextSequence') ?? 0;
        if (!Number.isSafeInteger(lastSequence) || lastSequence < 0 ||
            lastSequence === Number.MAX_SAFE_INTEGER) {
            throw new HttpsError('failed-precondition', 'Некорректный счётчик сообщений диалога');
        }
        const sequence = lastSequence + 1;
        const createdAt = FieldValue.serverTimestamp();
        const preview = { lastMessage: text.slice(0, 100), lastMessageTime: createdAt };
        tx.create(messageRef, {
            senderId: uid, clientMessageId, text, sequence, createdAt, read: false, edited: false
        });
        tx.update(chatRef, { nextSequence: sequence });
        tx.set(cooldownRef, { lastSentAt: Timestamp.fromMillis(nowMillis) });
        // Preserve the sender's unread count: sending does not read incoming messages.
        tx.set(db.collection('users').doc(uid).collection('chats').doc(partnerId), {
            partnerId, chatId, ...preview
        }, { merge: true });
        tx.set(db.collection('users').doc(partnerId).collection('chats').doc(uid), {
            partnerId: uid, chatId, ...preview, unread: FieldValue.increment(1)
        }, { merge: true });
        // A message notification is part of the same trusted transaction as
        // message creation. Its stable ID makes delivery idempotent on retries.
        tx.create(db.collection('users').doc(partnerId).collection('notifications').doc(
            `message_${messageId}`
        ), {
            type: 'message',
            title: 'Новое сообщение',
            message: text.slice(0, 120),
            icon: 'bi-chat-dots',
            color: 'primary',
            link: '#chat',
            fromUserId: uid,
            chatId,
            read: false,
            createdAt
        });
    });

    return { messageId, chatId };
}
