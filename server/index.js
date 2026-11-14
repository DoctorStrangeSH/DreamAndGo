import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { conversationPairKey } from './chat-pair.js';

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
