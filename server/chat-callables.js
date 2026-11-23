import { createHash } from 'node:crypto';

const REGION = 'europe-west3';
const MAX_TEXT_LENGTH = 4000;
const HISTORY_LIMIT = 50;
const MAX_UID_LENGTH = 128;

function validId(value, maxLength = MAX_UID_LENGTH) {
    return typeof value === 'string' &&
        value.length > 0 &&
        value.length <= maxLength &&
        !value.includes('/') &&
        value !== '.' &&
        value !== '..';
}

function requireActor(request, HttpsError) {
    const uid = request.auth?.uid;
    if (!validId(uid)) {
        throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    }
    return uid;
}

function requirePayload(data, keys, HttpsError) {
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        Object.keys(data).length !== keys.length ||
        keys.some(key => !Object.hasOwn(data, key))) {
        throw new HttpsError('invalid-argument', 'Некорректные параметры запроса');
    }
}

function requireChatId(data, HttpsError) {
    if (!validId(data.chatId, 64)) {
        throw new HttpsError('invalid-argument', 'Некорректный идентификатор чата');
    }
    return data.chatId;
}

function privateChatId(uidA, uidB) {
    return createHash('sha256')
        .update([uidA, uidB].sort().join('\u0000'))
        .digest('hex');
}

function participantData(snapshot, uid) {
    const data = snapshot.data() || {};
    const participants = Array.isArray(data.participants) ? data.participants : [];
    if (data.type !== 'private' || participants.length !== 2 || !participants.includes(uid)) {
        return null;
    }
    return { participants, partnerUid: participants.find(id => id !== uid) };
}

function userLabel(snapshot) {
    const data = snapshot.data() || {};
    const username = typeof data.username === 'string' ? data.username.trim() : '';
    const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : '';
    return username ? `@${username}` : (displayName || 'Пользователь');
}

function messageProjection(document) {
    const data = document.data() || {};
    const createdAt = data.createdAt;
    const readAt = data.readAt;
    return {
        id: document.id,
        senderId: data.senderId,
        text: data.text,
        createdAt: typeof createdAt?.toMillis === 'function' ? createdAt.toMillis() : null,
        read: data.read === true,
        readAt: typeof readAt?.toMillis === 'function' ? readAt.toMillis() : null,
        edited: data.edited === true,
        editedAt: typeof data.editedAt?.toMillis === 'function' ? data.editedAt.toMillis() : null
    };
}

function createChatCallables({ onCall, HttpsError, getFirestore, FieldValue }) {
    if (typeof onCall !== 'function' || typeof HttpsError !== 'function' ||
        typeof getFirestore !== 'function' ||
        typeof FieldValue?.serverTimestamp !== 'function' ||
        typeof FieldValue?.increment !== 'function') {
        throw new TypeError('Некорректная конфигурация Chat V2');
    }

    const options = { region: REGION, enforceAppCheck: true };

    const createPrivateChatV2 = onCall(options, async request => {
        const actorUid = requireActor(request, HttpsError);
        requirePayload(request.data, ['targetUid'], HttpsError);
        const targetUid = request.data.targetUid;
        if (!validId(targetUid) || targetUid === actorUid) {
            throw new HttpsError('invalid-argument', 'Некорректный собеседник');
        }

        const db = getFirestore();
        const chatId = privateChatId(actorUid, targetUid);
        const chatRef = db.collection('chats').doc(chatId);
        const actorRef = db.collection('users').doc(actorUid);
        const targetRef = db.collection('users').doc(targetUid);
        const actorFriendRef = actorRef.collection('friends').doc(targetUid);
        const targetFriendRef = targetRef.collection('friends').doc(actorUid);
        const actorSummaryRef = actorRef.collection('chats').doc(chatId);
        const targetSummaryRef = targetRef.collection('chats').doc(chatId);

        try {
            await db.runTransaction(async transaction => {
                const [actor, target, actorFriend, targetFriend, chat] = await Promise.all([
                    transaction.get(actorRef),
                    transaction.get(targetRef),
                    transaction.get(actorFriendRef),
                    transaction.get(targetFriendRef),
                    transaction.get(chatRef)
                ]);
                if (!actor.exists || !target.exists) {
                    throw new HttpsError('not-found', 'Пользователь не найден');
                }
                if (!actorFriend.exists || !targetFriend.exists) {
                    throw new HttpsError('permission-denied', 'Начать чат можно только с другом');
                }

                const timestamp = FieldValue.serverTimestamp();
                if (!chat.exists) {
                    transaction.create(chatRef, {
                        type: 'private',
                        schemaVersion: 2,
                        participants: [actorUid, targetUid].sort(),
                        createdBy: actorUid,
                        createdAt: timestamp,
                        updatedAt: timestamp,
                        lastMessageAt: timestamp
                    });
                } else {
                    const membership = participantData(chat, actorUid);
                    if (!membership || membership.partnerUid !== targetUid) {
                        throw new HttpsError('failed-precondition', 'Конфликт идентификатора чата');
                    }
                }

                const summary = {
                    chatId,
                    type: 'private',
                    partnerId: targetUid,
                    lastMessage: '',
                    lastMessageTime: timestamp,
                    unread: 0
                };
                const reverseSummary = { ...summary, partnerId: actorUid };
                if (!chat.exists) {
                    transaction.set(actorSummaryRef, summary);
                    transaction.set(targetSummaryRef, reverseSummary);
                } else {
                    // Existing conversations retain their current summaries and unread state.
                    transaction.set(actorSummaryRef, {
                        chatId, type: 'private', partnerId: targetUid
                    }, { merge: true });
                    transaction.set(targetSummaryRef, {
                        chatId, type: 'private', partnerId: actorUid
                    }, { merge: true });
                }
            });
            return { success: true, chatId };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('unavailable', 'Не удалось открыть диалог');
        }
    });

    const sendPrivateMessageV2 = onCall(options, async request => {
        const actorUid = requireActor(request, HttpsError);
        requirePayload(request.data, ['chatId', 'text'], HttpsError);
        const chatId = requireChatId(request.data, HttpsError);
        const text = typeof request.data.text === 'string' ? request.data.text.trim() : '';
        if (!text || text.length > MAX_TEXT_LENGTH) {
            throw new HttpsError('invalid-argument', 'Сообщение должно содержать от 1 до 4000 символов');
        }

        const db = getFirestore();
        const chatRef = db.collection('chats').doc(chatId);
        const messageRef = chatRef.collection('messages').doc();
        try {
            const result = await db.runTransaction(async transaction => {
                const chat = await transaction.get(chatRef);
                const membership = chat.exists ? participantData(chat, actorUid) : null;
                if (!membership) {
                    throw new HttpsError('permission-denied', 'Нет доступа к этому диалогу');
                }

                const receiverUid = membership.partnerUid;
                const senderRef = db.collection('users').doc(actorUid);
                const receiverRef = db.collection('users').doc(receiverUid);
                const senderSummaryRef = senderRef.collection('chats').doc(chatId);
                const receiverSummaryRef = receiverRef.collection('chats').doc(chatId);
                const notificationRef = receiverRef.collection('notifications').doc();
                const [sender, receiver, senderSummary, receiverSummary] = await Promise.all([
                    transaction.get(senderRef),
                    transaction.get(receiverRef),
                    transaction.get(senderSummaryRef),
                    transaction.get(receiverSummaryRef)
                ]);
                if (!sender.exists || !receiver.exists || !senderSummary.exists || !receiverSummary.exists) {
                    throw new HttpsError('failed-precondition', 'Диалог не инициализирован корректно');
                }

                const timestamp = FieldValue.serverTimestamp();
                const preview = text.slice(0, 100);
                const unread = Number.isSafeInteger(receiverSummary.data()?.unread)
                    ? Math.max(0, receiverSummary.data().unread)
                    : 0;
                transaction.create(messageRef, {
                    senderId: actorUid,
                    text,
                    createdAt: timestamp,
                    read: false,
                    edited: false
                });
                transaction.update(chatRef, { updatedAt: timestamp, lastMessageAt: timestamp });
                transaction.update(senderSummaryRef, {
                    lastMessage: preview, lastMessageTime: timestamp, unread: 0
                });
                transaction.update(receiverSummaryRef, {
                    lastMessage: preview, lastMessageTime: timestamp, unread: unread + 1
                });
                transaction.create(notificationRef, {
                    type: 'new_message',
                    title: 'Новое сообщение',
                    message: `${userLabel(sender)} отправил(а) тебе сообщение`,
                    icon: 'bi-chat-dots',
                    color: 'info',
                    link: '#chat',
                    fromUserId: actorUid,
                    read: false,
                    createdAt: timestamp
                });
                return { messageId: messageRef.id, receiverUid };
            });
            return { success: true, ...result };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('unavailable', 'Не удалось отправить сообщение');
        }
    });

    const getPrivateChatHistoryV2 = onCall(options, async request => {
        const actorUid = requireActor(request, HttpsError);
        requirePayload(request.data, ['chatId'], HttpsError);
        const chatId = requireChatId(request.data, HttpsError);
        try {
            const db = getFirestore();
            const chatRef = db.collection('chats').doc(chatId);
            const chat = await chatRef.get();
            if (!chat.exists || !participantData(chat, actorUid)) {
                throw new HttpsError('permission-denied', 'Нет доступа к этому диалогу');
            }
            const snapshot = await chatRef.collection('messages')
                .orderBy('createdAt', 'desc').limit(HISTORY_LIMIT).get();
            return { messages: snapshot.docs.map(messageProjection).reverse() };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('unavailable', 'Не удалось загрузить историю');
        }
    });

    const markPrivateMessageReadV2 = onCall(options, async request => {
        const actorUid = requireActor(request, HttpsError);
        requirePayload(request.data, ['chatId', 'messageId'], HttpsError);
        const chatId = requireChatId(request.data, HttpsError);
        const messageId = request.data.messageId;
        if (!validId(messageId, 150)) {
            throw new HttpsError('invalid-argument', 'Некорректный идентификатор сообщения');
        }

        const db = getFirestore();
        const chatRef = db.collection('chats').doc(chatId);
        const messageRef = chatRef.collection('messages').doc(messageId);
        try {
            await db.runTransaction(async transaction => {
                const chat = await transaction.get(chatRef);
                if (!chat.exists || !participantData(chat, actorUid)) {
                    throw new HttpsError('permission-denied', 'Нет доступа к этому диалогу');
                }
                const message = await transaction.get(messageRef);
                if (!message.exists) throw new HttpsError('not-found', 'Сообщение не найдено');
                const data = message.data() || {};
                if (data.senderId === actorUid) return;
                if (data.read === true) return;

                const summaryRef = db.collection('users').doc(actorUid).collection('chats').doc(chatId);
                const summary = await transaction.get(summaryRef);
                if (!summary.exists) throw new HttpsError('failed-precondition', 'Диалог не инициализирован');
                const unread = Number.isSafeInteger(summary.data()?.unread)
                    ? Math.max(0, summary.data().unread)
                    : 0;
                transaction.update(messageRef, { read: true, readAt: FieldValue.serverTimestamp() });
                transaction.update(summaryRef, { unread: Math.max(0, unread - 1) });
            });
            return { success: true };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('unavailable', 'Не удалось отметить сообщение прочитанным');
        }
    });

    const getPrivateChatUnreadV2 = onCall(options, async request => {
        const actorUid = requireActor(request, HttpsError);
        requirePayload(request.data, ['chatId'], HttpsError);
        const chatId = requireChatId(request.data, HttpsError);
        try {
            const db = getFirestore();
            const chatRef = db.collection('chats').doc(chatId);
            const chat = await chatRef.get();
            if (!chat.exists || !participantData(chat, actorUid)) {
                throw new HttpsError('permission-denied', 'Нет доступа к этому диалогу');
            }
            const summary = await db.collection('users').doc(actorUid).collection('chats').doc(chatId).get();
            if (!summary.exists) throw new HttpsError('failed-precondition', 'Диалог не инициализирован');
            const unread = Number.isSafeInteger(summary.data()?.unread) ? Math.max(0, summary.data().unread) : 0;
            return { unread };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('unavailable', 'Не удалось получить счётчик непрочитанных');
        }
    });

    return Object.freeze({
        createPrivateChatV2,
        sendPrivateMessageV2,
        getPrivateChatHistoryV2,
        markPrivateMessageReadV2,
        getPrivateChatUnreadV2
    });
}

export { privateChatId };
