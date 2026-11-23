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
    if (data.type !== 'private' || data.schemaVersion !== 2 ||
        participants.length !== 2 || participants[0] === participants[1] ||
        !participants.every(participant => validId(participant)) ||
        !participants.includes(uid)) {
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
                const [actor, target, actorFriend, targetFriend, chat, actorSummaryDoc, targetSummaryDoc] = await Promise.all([
                    transaction.get(actorRef),
                    transaction.get(targetRef),
                    transaction.get(actorFriendRef),
                    transaction.get(targetFriendRef),
                    transaction.get(chatRef),
                    transaction.get(actorSummaryRef),
                    transaction.get(targetSummaryRef)
                ]);
                if (!actor.exists || !target.exists) {
                    throw new HttpsError('not-found', 'Пользователь не найден');
                }
                if (!actorFriend.exists || !targetFriend.exists ||
                    actorFriend.data()?.friendId !== targetUid ||
                    targetFriend.data()?.friendId !== actorUid) {
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

                const actorData = actor.data() || {};
                const targetData = target.data() || {};
                const summary = {
                    chatId,
                    type: 'private',
                    partnerId: targetUid,
                    partnerName: targetData.username || targetData.displayName || 'Пользователь',
                    partnerAvatar: typeof targetData.avatar === 'string' ? targetData.avatar : null,
                    lastMessage: '',
                    lastMessageTime: timestamp,
                    unread: 0
                };
                const reverseSummary = {
                    ...summary,
                    partnerId: actorUid,
                    partnerName: actorData.username || actorData.displayName || 'Пользователь',
                    partnerAvatar: typeof actorData.avatar === 'string' ? actorData.avatar : null
                };
                if (!chat.exists) {
                    transaction.set(actorSummaryRef, summary);
                    transaction.set(targetSummaryRef, reverseSummary);
                } else {
                    // Existing conversations retain their current summaries and unread state.
                    if (actorSummaryDoc.exists) {
                        transaction.set(actorSummaryRef, {
                            chatId, type: 'private', partnerId: targetUid,
                            partnerName: summary.partnerName, partnerAvatar: summary.partnerAvatar
                        }, { merge: true });
                    } else {
                        transaction.set(actorSummaryRef, summary);
                    }
                    if (targetSummaryDoc.exists) {
                        transaction.set(targetSummaryRef, {
                            chatId, type: 'private', partnerId: actorUid,
                            partnerName: reverseSummary.partnerName, partnerAvatar: reverseSummary.partnerAvatar
                        }, { merge: true });
                    } else {
                        transaction.set(targetSummaryRef, reverseSummary);
                    }
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
        requirePayload(request.data, ['chatId', 'text', 'clientMessageId'], HttpsError);
        const chatId = requireChatId(request.data, HttpsError);
        const text = typeof request.data.text === 'string' ? request.data.text.trim() : '';
        const clientMessageId = request.data.clientMessageId;
        if (!text || text.length > MAX_TEXT_LENGTH) {
            throw new HttpsError('invalid-argument', 'Сообщение должно содержать от 1 до 4000 символов');
        }
        if (!validId(clientMessageId, 128)) {
            throw new HttpsError('invalid-argument', 'Некорректный идентификатор отправки');
        }

        const db = getFirestore();
        const chatRef = db.collection('chats').doc(chatId);
        const messageRef = chatRef.collection('messages').doc(clientMessageId);
        try {
            const result = await db.runTransaction(async transaction => {
                const [chat, existingMessage] = await Promise.all([
                    transaction.get(chatRef),
                    transaction.get(messageRef)
                ]);
                const membership = chat.exists ? participantData(chat, actorUid) : null;
                if (!membership) {
                    throw new HttpsError('permission-denied', 'Нет доступа к этому диалогу');
                }

                if (existingMessage.exists) {
                    const existing = existingMessage.data() || {};
                    if (existing.senderId !== actorUid || existing.text !== text) {
                        throw new HttpsError('already-exists', 'Идентификатор отправки уже использован');
                    }
                    return { messageId: messageRef.id, receiverUid: membership.partnerUid, duplicate: true };
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
                if (!sender.exists || !receiver.exists || !senderSummary.exists || !receiverSummary.exists ||
                    senderSummary.data()?.partnerId !== receiverUid ||
                    receiverSummary.data()?.partnerId !== actorUid) {
                    throw new HttpsError('failed-precondition', 'Диалог не инициализирован корректно');
                }

                const timestamp = FieldValue.serverTimestamp();
                const preview = text.slice(0, 100);
                const senderUnread = Number.isSafeInteger(senderSummary.data()?.unread)
                    ? Math.max(0, senderSummary.data().unread)
                    : 0;
                const receiverUnread = Number.isSafeInteger(receiverSummary.data()?.unread)
                    ? Math.max(0, receiverSummary.data().unread)
                    : 0;
                transaction.create(messageRef, {
                    senderId: actorUid,
                    text,
                    clientMessageId,
                    createdAt: timestamp,
                    read: false,
                    edited: false
                });
                transaction.update(chatRef, { updatedAt: timestamp, lastMessageAt: timestamp });
                transaction.update(senderSummaryRef, {
                    lastMessage: preview, lastMessageTime: timestamp, unread: senderUnread
                });
                transaction.update(receiverSummaryRef, {
                    lastMessage: preview, lastMessageTime: timestamp, unread: receiverUnread + 1
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
                return { messageId: messageRef.id, receiverUid, duplicate: false };
            });
            return { success: true, ...result };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('unavailable', 'Не удалось отправить сообщение');
        }
    });

    const getMyChatContactsV2 = onCall(options, async request => {
        const actorUid = requireActor(request, HttpsError);
        requirePayload(request.data, [], HttpsError);
        try {
            const db = getFirestore();
            const friends = await db.collection('users').doc(actorUid)
                .collection('friends')
                .limit(100)
                .get();

            const contacts = await Promise.all(friends.docs.map(async friend => {
                const partnerUid = friend.id;
                if (!validId(partnerUid) || partnerUid === actorUid) return null;
                const [publicProfile, privateProfile] = await Promise.all([
                    db.collection('publicProfiles').doc(partnerUid).get(),
                    db.collection('users').doc(partnerUid).get()
                ]);
                const publicData = publicProfile.exists ? publicProfile.data() || {} : {};
                const privateData = privateProfile.exists ? privateProfile.data() || {} : {};
                const username = typeof publicData.username === 'string' && publicData.username
                    ? publicData.username
                    : (typeof privateData.username === 'string' ? privateData.username : '');
                if (!username) return null;
                return {
                    uid: partnerUid,
                    username,
                    displayName: typeof publicData.displayName === 'string' && publicData.displayName
                        ? publicData.displayName
                        : (typeof privateData.displayName === 'string' ? privateData.displayName : username),
                    avatar: typeof publicData.avatar === 'string'
                        ? publicData.avatar
                        : (typeof privateData.avatar === 'string' ? privateData.avatar : null)
                };
            }));

            return { contacts: contacts.filter(Boolean) };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('unavailable', 'Не удалось загрузить список друзей');
        }
    });

    const getMyPrivateChatsV2 = onCall(options, async request => {
        const actorUid = requireActor(request, HttpsError);
        requirePayload(request.data, [], HttpsError);
        try {
            const db = getFirestore();
            const summaries = await db.collection('users').doc(actorUid)
                .collection('chats')
                .orderBy('lastMessageTime', 'desc')
                .limit(50)
                .get();

            const chats = await Promise.all(summaries.docs.map(async summary => {
                const data = summary.data() || {};
                const chatId = summary.id;
                const partnerUid = data.partnerId;
                if (data.type !== 'private' || !validId(chatId, 64) || !validId(partnerUid)) {
                    return null;
                }

                const chatRef = db.collection('chats').doc(chatId);
                const [chat, profile, privateProfile] = await Promise.all([
                    chatRef.get(),
                    db.collection('publicProfiles').doc(partnerUid).get(),
                    db.collection('users').doc(partnerUid).get()
                ]);
                const membership = chat.exists ? participantData(chat, actorUid) : null;
                if (!membership || membership.partnerUid !== partnerUid) return null;

                const profileData = profile.exists ? profile.data() || {} : {};
                const privateData = privateProfile.exists ? privateProfile.data() || {} : {};
                const lastMessageTime = data.lastMessageTime;
                return {
                    id: chatId,
                    chatId,
                    partnerId: partnerUid,
                    partnerName: data.partnerName ||
                        (typeof profileData.username === 'string' && profileData.username
                            ? profileData.username
                            : (privateData.username || privateData.displayName || 'Пользователь')),
                    partnerAvatar: typeof profileData.avatar === 'string'
                        ? profileData.avatar
                        : (typeof data.partnerAvatar === 'string' ? data.partnerAvatar : null),
                    lastMessage: typeof data.lastMessage === 'string' ? data.lastMessage : '',
                    lastMessageTime: typeof lastMessageTime?.toMillis === 'function'
                        ? lastMessageTime.toMillis()
                        : null,
                    unread: Number.isSafeInteger(data.unread) ? Math.max(0, data.unread) : 0,
                    isGroup: false
                };
            }));

            return { chats: chats.filter(Boolean) };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('unavailable', 'Не удалось загрузить список диалогов');
        }
    });

    const getPrivateChatHistoryV2 = onCall(options, async request => {
        const actorUid = requireActor(request, HttpsError);
        const data = request.data;
        if (!data || typeof data !== 'object' || Array.isArray(data) ||
            !Object.hasOwn(data, 'chatId') ||
            Object.keys(data).some(key => !['chatId', 'beforeMessageId'].includes(key))) {
            throw new HttpsError('invalid-argument', 'Некорректные параметры запроса');
        }
        const chatId = requireChatId(data, HttpsError);
        const beforeMessageId = data.beforeMessageId;
        if (beforeMessageId !== undefined && !validId(beforeMessageId, 150)) {
            throw new HttpsError('invalid-argument', 'Некорректный курсор истории');
        }
        try {
            const db = getFirestore();
            const chatRef = db.collection('chats').doc(chatId);
            const chat = await chatRef.get();
            if (!chat.exists || !participantData(chat, actorUid)) {
                throw new HttpsError('permission-denied', 'Нет доступа к этому диалогу');
            }

            const messagesRef = chatRef.collection('messages');
            let historyQuery = messagesRef.orderBy('createdAt', 'desc');
            if (beforeMessageId) {
                const cursor = await messagesRef.doc(beforeMessageId).get();
                if (!cursor.exists) {
                    throw new HttpsError('invalid-argument', 'Курсор истории больше не существует');
                }
                historyQuery = historyQuery.startAfter(cursor);
            }
            const snapshot = await historyQuery.limit(HISTORY_LIMIT + 1).get();
            const hasMore = snapshot.docs.length > HISTORY_LIMIT;
            const page = snapshot.docs.slice(0, HISTORY_LIMIT);
            return {
                messages: page.map(messageProjection).reverse(),
                nextCursor: hasMore && page.length ? page[page.length - 1].id : null
            };
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

    const getPrivateMessageStatusV2 = onCall(options, async request => {
        const actorUid = requireActor(request, HttpsError);
        requirePayload(request.data, ['chatId', 'messageId'], HttpsError);
        const chatId = requireChatId(request.data, HttpsError);
        const messageId = request.data.messageId;
        if (!validId(messageId, 150)) {
            throw new HttpsError('invalid-argument', 'Некорректный идентификатор сообщения');
        }
        try {
            const chatRef = getFirestore().collection('chats').doc(chatId);
            const chat = await chatRef.get();
            if (!chat.exists || !participantData(chat, actorUid)) {
                throw new HttpsError('permission-denied', 'Нет доступа к этому диалогу');
            }
            const message = await chatRef.collection('messages').doc(messageId).get();
            if (!message.exists) throw new HttpsError('not-found', 'Сообщение не найдено');
            const data = message.data() || {};
            return {
                senderId: data.senderId,
                read: data.read === true,
                readAt: typeof data.readAt?.toMillis === 'function' ? data.readAt.toMillis() : null
            };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('unavailable', 'Не удалось получить статус сообщения');
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
        getMyChatContactsV2,
        getMyPrivateChatsV2,
        getPrivateChatHistoryV2,
        getPrivateMessageStatusV2,
        markPrivateMessageReadV2,
        getPrivateChatUnreadV2
    });
}

export { privateChatId };
