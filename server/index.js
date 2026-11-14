import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { conversationPairKey } from './chat-pair.js';
import { normalizeChatMessage, otherChatParticipant, normalizeClientMessageId, serverMessageDocumentId } from './message-policy.js';

if (getApps().length === 0) initializeApp();

// Candidate v2 endpoint. Do not deploy until legacy data migration,
// complete Firestore rules, block policy and client rollout are ready.
export const createPrivateChatV2 = onCall({ region: 'europe-west3' }, async request => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');

    const partnerId = request.data?.partnerId;
    if (typeof partnerId !== 'string' || !partnerId || partnerId.length > 128 ||
        partnerId.includes('/') || partnerId === uid) {
        throw new HttpsError('invalid-argument', 'Некорректный получатель');
    }

    // Reject nonexistent recipients. Blocking/privacy policy must be added
    // before production use.
    try {
        await getAuth().getUser(partnerId);
    } catch {
        throw new HttpsError('not-found', 'Пользователь не найден');
    }

    const db = getFirestore();
    const pairKey = conversationPairKey(uid, partnerId);
    const pairRef = db.collection('chatPairs').doc(pairKey);
    const participants = [uid, partnerId].sort();

    const chatId = await db.runTransaction(async tx => {
        const pair = await tx.get(pairRef);
        if (pair.exists) {
            const existingChatId = pair.get('chatId');
            if (typeof existingChatId !== 'string' || !existingChatId) {
                throw new HttpsError('internal', 'Повреждённый индекс диалога');
            }
            const existingChat = await tx.get(db.collection('chats').doc(existingChatId));
            if (!existingChat.exists || existingChat.get('state') !== 'active') {
                throw new HttpsError('failed-precondition', 'Диалог недоступен');
            }
            return existingChatId;
        }

        const chatRef = db.collection('chats').doc();
        tx.create(chatRef, {
            participants,
            state: 'active',
            version: 2,
            createdAt: FieldValue.serverTimestamp()
        });
        tx.create(pairRef, {
            chatId: chatRef.id,
            participants,
            createdAt: FieldValue.serverTimestamp()
        });
        return chatRef.id;
    });

    return { chatId, version: 2 };
});

 
// Candidate v2 sending protocol: one transaction checks membership/state and
// writes both the message and participants' previews. Not yet wired to the UI.
export const sendPrivateMessageV2 = onCall({ region: 'europe-west3' }, async request => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');

    const chatId = request.data?.chatId;
    const text = normalizeChatMessage(request.data?.text);
    const clientMessageId = normalizeClientMessageId(request.data?.clientMessageId);
    if (!clientMessageId || typeof chatId !== 'string' || !chatId || chatId.includes('/') || chatId.length > 128 ||
        !text) {
        throw new HttpsError('invalid-argument', 'Некорректное сообщение');
    }

    const db = getFirestore();
    const chatRef = db.collection('chats').doc(chatId);
    const messageId = serverMessageDocumentId(chatId, uid, clientMessageId);
    const messageRef = chatRef.collection('messages').doc(messageId);

    await db.runTransaction(async tx => {
        // Firestore requires all reads before any writes. Reading the deterministic
        // message document also serializes concurrent retries of the same request.
        const snapshot = await tx.get(chatRef);
        const priorMessage = await tx.get(messageRef);
        if (!snapshot.exists || snapshot.get('version') !== 2 || snapshot.get('state') !== 'active') {
            throw new HttpsError('failed-precondition', 'Диалог недоступен');
        }
        const partnerId = otherChatParticipant(snapshot.get('participants'), uid);
        if (!partnerId) throw new HttpsError('permission-denied', 'Нет доступа к переписке');
        if (priorMessage.exists) {
            // A reused key with different contents must not silently alter a message.
            if (priorMessage.get('senderId') !== uid || priorMessage.get('text') !== text ||
                priorMessage.get('clientMessageId') !== clientMessageId) {
                throw new HttpsError('already-exists', 'Идентификатор сообщения уже использован');
            }
            return;
        }

        const createdAt = FieldValue.serverTimestamp();
        const preview = { lastMessage: text.slice(0, 100), lastMessageTime: createdAt };
        tx.create(messageRef, {
            senderId: uid, clientMessageId, text, createdAt, read: false, edited: false
        });
        // Preserve the sender's unread count: sending does not read incoming messages.
        tx.set(db.collection('users').doc(uid).collection('chats').doc(partnerId), {
            partnerId, chatId, ...preview
        }, { merge: true });
        tx.set(db.collection('users').doc(partnerId).collection('chats').doc(uid), {
            partnerId: uid, chatId, ...preview, unread: FieldValue.increment(1)
        }, { merge: true });
    });

    return { messageId, chatId };
});
