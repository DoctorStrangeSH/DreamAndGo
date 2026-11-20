import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { conversationPairKey } from './chat-pair.js';
import { isConversationBlocked } from './block-policy.js';
import { mutateFriendship } from './friendship-transactions.js';
import { isValidUserId, isValidDocumentId, normalizeChatMessage, normalizeClientMessageId } from './message-policy.js';
import { sendPrivateMessageTransaction } from './chat-transactions.js';
import { getPrivateMessageStatus } from './message-status.js';
import { markPrivateMessageReadTransaction } from './chat-read-receipts.js';
import { getPrivateChatUnreadCount } from './chat-unread-status.js';
import { loadPrivateChatHistory } from './chat-history-service.js';
import { createFirestoreHistoryAdapter } from './chat-history-firestore.js';
import { loadPublicProfile, findPublicProfileByUsername, loadPublicProfiles } from './public-profile-service.js';
import { setPublicProfileVisibility } from './public-profile-visibility.js';
import { consumeProfileLookupQuota } from './profile-lookup-quota.js';
import { registerProfileWithReservedUsername } from './username-reservation.js';
import { getRegistrationState } from './registration-state.js';
import { refreshUserStatsTransaction } from './profile-stats.js';
import { awardXpForVerifiedEvent } from './xp-rewards.js';
import { isRewardableCollectionRecord, isDreamCompletionTransition } from '../js/core/xp-reward-policy.js';
import { ensureDailyTasks, recordDailyTaskProgress, claimDailyTaskReward, claimDailyTaskBonus } from './daily-tasks.js';

if (getApps().length === 0) initializeApp();

// Candidate v2 endpoint. Do not deploy until legacy data migration,
// complete Firestore rules, block policy and client rollout are ready.
export const createPrivateChatV2 = onCall({ region: 'europe-west3' }, async request => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');

    const partnerId = request.data?.partnerId;
    if (!isValidUserId(uid)) throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    if (!isValidUserId(partnerId) || partnerId === uid) {
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
    if (!isValidUserId(uid)) throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');

    const chatId = request.data?.chatId;
    const text = normalizeChatMessage(request.data?.text);
    const clientMessageId = normalizeClientMessageId(request.data?.clientMessageId);
    if (!clientMessageId || !isValidDocumentId(chatId) || !text) {
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

// Bounded batch lookup for friends, incoming and outgoing request lists.
// One authenticated/App-Check request per screen load, not one request per row.
export const getPublicProfilesV2 = onCall({ region: 'europe-west3', enforceAppCheck: true }, async request => {
    const db = getFirestore();
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    const userIds = request.data?.userIds;
    if (!Array.isArray(userIds) || userIds.length > 50) {
        throw new HttpsError('invalid-argument', 'Некорректный список профилей');
    }
    if (!await consumeProfileLookupQuota(db, uid)) {
        throw new HttpsError('resource-exhausted', 'Слишком много запросов к профилям');
    }
    const result = await loadPublicProfiles(db, uid, userIds);
    if (!result.ok) throw new HttpsError(result.code, 'Профили недоступны');
    return { profiles: result.profiles };
});

// Explicit owner consent. Enabling is blocked until the audited username
// registry backfill is complete; disabling remains available immediately.
export const setPublicProfileVisibilityV2 = onCall({ region: 'europe-west3', enforceAppCheck: true }, async request => {
    const uid = request.auth?.uid;
    if (!isValidUserId(uid)) throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    const result = await setPublicProfileVisibility(
        getFirestore(), uid, request.data?.enabled, () => FieldValue.serverTimestamp()
    );
    if (!result.ok) {
        const message = result.code === 'failed-precondition'
            ? 'Публичный профиль пока нельзя включить: безопасная миграция никнеймов ещё не завершена'
            : 'Не удалось изменить видимость профиля';
        throw new HttpsError(result.code, message);
    }
    return { enabled: result.enabled };
});



// Candidate secure signup finalization. This does NOT bypass the mandatory
// legacy migration gate at system/usernameRegistry, and is not wired to the UI.
export const registerProfileV2 = onCall({ region: 'europe-west3', enforceAppCheck: true }, async request => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    const account = await getAuth().getUser(uid);
    if (!account.email || account.disabled) {
        throw new HttpsError('failed-precondition', 'Нужен действующий аккаунт с email');
    }
    const result = await registerProfileWithReservedUsername(
        getFirestore(), uid, request.data?.username, account.email,
        () => FieldValue.serverTimestamp()
    );
    if (!result.ok) {
        const message = result.code === 'already-exists'
            ? 'Никнейм занят или профиль уже существует'
            : result.code === 'failed-precondition'
                ? 'Регистрация временно недоступна до безопасной миграции'
                : 'Некорректный никнейм';
        throw new HttpsError(result.code, message);
    }
    return { username: result.username, recovered: result.recovered === true };
});

// Read-only, own-account recovery state. No private profile data is returned.
export const getRegistrationStateV2 = onCall({ region: 'europe-west3', enforceAppCheck: true }, async request => {
    const result = await getRegistrationState(getFirestore(), request.auth?.uid);
    if (!result.ok) throw new HttpsError(result.code, 'Требуется вход в аккаунт');
    return { status: result.status };
});


// Recompute personal collection counters from Firestore on the trusted server.
// The caller cannot submit counts or another user's UID.
export const refreshUserStatsV2 = onCall({ region: 'europe-west3', enforceAppCheck: true }, async request => {
    const uid = request.auth?.uid;
    if (!isValidUserId(uid)) throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    try {
        return await refreshUserStatsTransaction(getFirestore(), uid);
    } catch (error) {
        if (error?.code === 'not-found') {
            throw new HttpsError('failed-precondition', 'Профиль пользователя не найден');
        }
        if (error?.code === 'invalid-argument') {
            throw new HttpsError('invalid-argument', 'Некорректный идентификатор пользователя');
        }
        throw new HttpsError('internal', 'Не удалось обновить статистику профиля');
    }
});


// XP is awarded only from persisted Firestore events. Stable event IDs and a
// transaction make retries idempotent; daily limits constrain low-effort farming.
function createCollectionXpTrigger(collectionName, action) {
    return onDocumentCreated({
        document: `users/{userId}/${collectionName}/{recordId}`,
        region: 'europe-west3'
    }, async event => {
        const { userId, recordId } = event.params;
        if (!event.data || !isRewardableCollectionRecord(collectionName, event.data.data(), recordId)) return;
        const db = getFirestore();
        await awardXpForVerifiedEvent(db, {
            uid: userId,
            action,
            sourceId: recordId,
            eventKey: `created_${collectionName}_${recordId}`,
            occurredAt: event.time
        });
        await recordDailyTaskProgress(db, {
            uid: userId,
            action: collectionName,
            sourceId: recordId,
            occurredAt: event.time
        });
    });
}

export const awardTravelXpV2 = createCollectionXpTrigger('travels', 'travels');
export const awardRestaurantXpV2 = createCollectionXpTrigger('restaurants', 'restaurants');
export const awardMovieXpV2 = createCollectionXpTrigger('movies', 'movies');
export const awardBookXpV2 = createCollectionXpTrigger('books', 'books');
export const awardDreamXpV2 = createCollectionXpTrigger('dreams', 'dreams');
export const awardFriendXpV2 = createCollectionXpTrigger('friends', 'friends');

export const awardDreamCompletionXpV2 = onDocumentUpdated({
    document: 'users/{userId}/dreams/{recordId}',
    region: 'europe-west3'
}, async event => {
    if (!event.data || !isDreamCompletionTransition(
        event.data.before.data(), event.data.after.data()
    )) return;
    const { userId, recordId } = event.params;
    if (!isRewardableCollectionRecord('dreams', event.data.after.data(), recordId)) return;
    await awardXpForVerifiedEvent(getFirestore(), {
        uid: userId,
        action: 'complete_dream',
        sourceId: recordId,
        eventKey: `completed_dream_${recordId}`,
        occurredAt: event.time
    });
});


// Server-owned daily tasks. The client can request a snapshot and claim a
// completed reward, but cannot assign tasks or submit progress counters.
export const getDailyTasksV2 = onCall({ region: 'europe-west3', enforceAppCheck: true }, async request => {
    const uid = request.auth?.uid;
    if (!isValidUserId(uid)) throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    const result = await ensureDailyTasks(getFirestore(), uid);
    if (!result) throw new HttpsError('failed-precondition', 'Профиль пользователя не найден');
    return result;
});

export const claimDailyTaskRewardV2 = onCall({ region: 'europe-west3', enforceAppCheck: true }, async request => {
    const uid = request.auth?.uid;
    if (!isValidUserId(uid)) throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    const result = await claimDailyTaskReward(getFirestore(), uid, request.data?.taskId);
    if (!result.claimed) {
        const code = result.reason === 'daily-xp-limit' || result.reason === 'daily-claim-limit'
            ? 'resource-exhausted'
            : result.reason === 'invalid-task' ? 'invalid-argument' : 'failed-precondition';
        throw new HttpsError(code, 'Награда пока недоступна');
    }
    return result;
});

export const claimDailyTaskBonusV2 = onCall({ region: 'europe-west3', enforceAppCheck: true }, async request => {
    const uid = request.auth?.uid;
    if (!isValidUserId(uid)) throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    const result = await claimDailyTaskBonus(getFirestore(), uid);
    if (!result.claimed) {
        const code = result.reason === 'daily-xp-limit' || result.reason === 'daily-claim-limit'
            ? 'resource-exhausted' : 'failed-precondition';
        throw new HttpsError(code, 'Бонус пока недоступен');
    }
    return result;
});


// Server-owned friendship lifecycle. The caller UID is always taken from Auth;
// clients never write relationship documents belonging to another account.
export const mutateFriendshipV2 = onCall({ region: 'europe-west3', enforceAppCheck: true }, async request => {
    const uid = request.auth?.uid;
    const targetUid = request.data?.targetUid;
    const action = request.data?.action;
    if (!isValidUserId(uid)) throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    if (!isValidUserId(targetUid) || targetUid === uid ||
        !['send', 'accept', 'reject', 'cancel', 'remove'].includes(action)) {
        throw new HttpsError('invalid-argument', 'Некорректная операция с друзьями');
    }

    if (action === 'send') {
        try {
            await getAuth().getUser(targetUid);
        } catch {
            throw new HttpsError('not-found', 'Пользователь не найден');
        }
    }

    const result = await mutateFriendship(
        getFirestore(), uid, targetUid, action, () => FieldValue.serverTimestamp()
    );
    if (!result.ok) {
        const message = result.code === 'already-exists'
            ? 'Вы уже друзья или связь уже существует'
            : result.code === 'not-found'
                ? 'Заявка или дружба не найдена'
                : result.code === 'failed-precondition'
                    ? 'Состояние заявки изменилось. Обнови список и попробуй снова'
                    : 'Некорректная операция с друзьями';
        throw new HttpsError(result.code, message);
    }
    return { success: true, action };
});
