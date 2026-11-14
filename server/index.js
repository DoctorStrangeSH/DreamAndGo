import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { conversationPairKey } from './chat-pair.js';
import { isConversationBlocked } from './block-policy.js';
import { normalizeChatMessage, normalizeClientMessageId } from './message-policy.js';
import { sendPrivateMessageTransaction } from './chat-transactions.js';

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
    // Each user owns their own blockedUsers list. Either direction denies contact.
    const senderBlockRef = db.collection('users').doc(uid).collection('blockedUsers').doc(partnerId);
    const recipientBlockRef = db.collection('users').doc(partnerId).collection('blockedUsers').doc(uid);
    const participants = [uid, partnerId].sort();

    const chatId = await db.runTransaction(async tx => {
        const [senderBlock, recipientBlock, pair] = await Promise.all([
            tx.get(senderBlockRef), tx.get(recipientBlockRef), tx.get(pairRef)
        ]);
        if (isConversationBlocked(senderBlock, recipientBlock)) {
            throw new HttpsError('permission-denied', 'Общение с пользователем недоступно');
        }
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

    return sendPrivateMessageTransaction(getFirestore(), uid, chatId, text, clientMessageId);
});
