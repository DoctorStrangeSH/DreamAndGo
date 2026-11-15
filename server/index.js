import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { conversationPairKey } from './chat-pair.js';
import { isConversationBlocked } from './block-policy.js';
import { normalizeChatMessage, normalizeClientMessageId } from './message-policy.js';
import { sendPrivateMessageTransaction } from './chat-transactions.js';
import { getPrivateMessageStatus } from './message-status.js';
import { markPrivateMessageReadTransaction } from './chat-read-receipts.js';
import { getPrivateChatUnreadCount } from './chat-unread-status.js';
import { loadPrivateChatHistory } from './chat-history-service.js';
import { createFirestoreHistoryAdapter } from './chat-history-firestore.js';
import { loadPublicProfile, findPublicProfileByUsername } from './public-profile-service.js';
import { consumeProfileLookupQuota } from './profile-lookup-quota.js';

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
            if (!existingChat.exists || existingChat.get('version') !== 2 ||
                existingChat.get('state') !== 'active') {
                throw new HttpsError('failed-precondition', 'Диалог недоступен');
            }
            const existingParticipants = existingChat.get('participants');
            if (!Array.isArray(existingParticipants) ||
                existingParticipants.length !== 2 ||
                existingParticipants[0] !== participants[0] ||
                existingParticipants[1] !== participants[1]) {
                throw new HttpsError('failed-precondition', 'Нарушена целостность диалога');
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

// Candidate read-only v2 status check; intentionally not deployed or wired to legacy UI.
export const getPrivateMessageStatusV2 = onCall({ region: 'europe-west3' }, async request => {
    return getPrivateMessageStatus(
        getFirestore(), request.auth?.uid, request.data?.chatId, request.data?.clientMessageId
    );
});

// Candidate v2 only. No client-selected sender or timestamp is trusted.
export const markPrivateMessageReadV2 = onCall({ region: 'europe-west3' }, async request => {
    return markPrivateMessageReadTransaction(
        getFirestore(), request.auth?.uid, request.data?.chatId, request.data?.messageId
    );
});

// Candidate v2 only: read-only recovery after reconnect or reinstall.
export const getPrivateChatUnreadV2 = onCall({ region: 'europe-west3' }, async request => {
    return getPrivateChatUnreadCount(getFirestore(), request.auth?.uid, request.data?.chatId);
});

// Candidate v2 only: authenticated, read-only cursor-based history.
export const getPrivateChatHistoryV2 = onCall({ region: 'europe-west3' }, async request => {
    try {
        const result = await loadPrivateChatHistory(
            request.auth?.uid, request.data, createFirestoreHistoryAdapter(getFirestore())
        );
        if (!result.ok) {
            throw new HttpsError(result.code, 'История диалога недоступна');
        }
        const { ok: _authorized, ...page } = result;
        return page;
    } catch (error) {
        // Corrupted database rows must fail closed without exposing internals.
        if (error instanceof TypeError) {
            throw new HttpsError('internal', 'Не удалось прочитать историю диалога');
        }
        throw error;
    }
});

// Candidate read-only profile endpoint. Allows future clients to find a public
// profile without reading the private users/{uid} Firestore document.
// Not enabled in the existing UI; keep production rules locked until rollout.
export const getPublicProfileV2 = onCall({ region: 'europe-west3', enforceAppCheck: true }, async request => {
    const db = getFirestore();
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    if (!await consumeProfileLookupQuota(db, uid)) {
        throw new HttpsError('resource-exhausted', 'Слишком много запросов к профилям');
    }
    const result = await loadPublicProfile(db, uid, request.data?.userId);
    if (!result.ok) throw new HttpsError(result.code, 'Профиль недоступен');
    return result.profile;
});

// Exact-match username lookup; never sends private users/{uid} documents.
// Do not deploy until App Check, per-user quotas and client switch are ready.
export const findPublicProfileByUsernameV2 = onCall({ region: 'europe-west3', enforceAppCheck: true }, async request => {
    const db = getFirestore();
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    if (!await consumeProfileLookupQuota(db, uid)) {
        throw new HttpsError('resource-exhausted', 'Слишком много запросов к профилям');
    }
    const result = await findPublicProfileByUsername(db, uid, request.data?.username);
    if (!result.ok) throw new HttpsError(result.code, 'Поиск пользователя недоступен');
    return { profile: result.profile };
});
