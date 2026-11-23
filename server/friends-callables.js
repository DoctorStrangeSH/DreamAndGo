const REGION = 'europe-west3';
const MAX_UID_LENGTH = 128;

function validUid(value) {
    return typeof value === 'string' &&
        value.length > 0 &&
        value.length <= MAX_UID_LENGTH &&
        !value.includes('/') &&
        value !== '.' &&
        value !== '..';
}

function requireActor(request, HttpsError) {
    const uid = request.auth?.uid;
    if (!validUid(uid)) {
        throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    }
    return uid;
}

function requireTarget(data, HttpsError) {
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        Object.keys(data).length !== 1 ||
        !Object.hasOwn(data, 'targetUid') ||
        !validUid(data.targetUid)) {
        throw new HttpsError('invalid-argument', 'Некорректный идентификатор пользователя');
    }
    return data.targetUid;
}

function profileLabel(snapshot) {
    const data = snapshot.data() || {};
    const username = typeof data.username === 'string' ? data.username.trim() : '';
    const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : '';
    return username ? `@${username}` : (displayName || 'Пользователь');
}

function incrementFriendCount(transaction, userRef, snapshot, delta) {
    const data = snapshot.data() || {};
    const stats = data.stats && typeof data.stats === 'object' && !Array.isArray(data.stats)
        ? data.stats
        : {};
    const current = Number.isSafeInteger(stats.friends) && stats.friends >= 0
        ? stats.friends
        : 0;
    transaction.update(userRef, { 'stats.friends': Math.max(0, current + delta) });
}

function createFriendCallables({ onCall, HttpsError, getFirestore, FieldValue }) {
    if (typeof onCall !== 'function' || typeof HttpsError !== 'function' ||
        typeof getFirestore !== 'function' ||
        typeof FieldValue?.serverTimestamp !== 'function') {
        throw new TypeError('Некорректная конфигурация операций с друзьями');
    }

    const options = { region: REGION, enforceAppCheck: true };

    const sendFriendRequestV1 = onCall(options, async request => {
        const actorUid = requireActor(request, HttpsError);
        const targetUid = requireTarget(request.data, HttpsError);
        if (actorUid === targetUid) {
            throw new HttpsError('failed-precondition', 'Нельзя добавить самого себя');
        }

        const db = getFirestore();
        const actorRef = db.collection('users').doc(actorUid);
        const targetRef = db.collection('users').doc(targetUid);
        const incomingRef = targetRef.collection('friendRequests').doc(actorUid);
        const outgoingRef = actorRef.collection('sentRequests').doc(targetUid);
        const actorFriendRef = actorRef.collection('friends').doc(targetUid);
        const targetFriendRef = targetRef.collection('friends').doc(actorUid);
        const notificationRef = targetRef.collection('notifications').doc();

        try {
            return await db.runTransaction(async transaction => {
                const [actor, target, incoming, outgoing, actorFriend, targetFriend] = await Promise.all([
                    transaction.get(actorRef),
                    transaction.get(targetRef),
                    transaction.get(incomingRef),
                    transaction.get(outgoingRef),
                    transaction.get(actorFriendRef),
                    transaction.get(targetFriendRef)
                ]);
                if (!actor.exists || !target.exists) {
                    throw new HttpsError('not-found', 'Пользователь не найден');
                }
                if (actorFriend.exists || targetFriend.exists) {
                    throw new HttpsError('already-exists', 'Вы уже друзья');
                }
                if (incoming.exists || outgoing.exists) {
                    throw new HttpsError('already-exists', 'Заявка уже существует');
                }

                const createdAt = FieldValue.serverTimestamp();
                const fromLabel = profileLabel(actor);
                transaction.create(incomingRef, {
                    from: actorUid, to: targetUid, status: 'pending', createdAt
                });
                transaction.create(outgoingRef, {
                    from: actorUid, to: targetUid, status: 'pending', createdAt
                });
                transaction.create(notificationRef, {
                    type: 'friend_request',
                    title: 'Новая заявка в друзья',
                    message: `${fromLabel} хочет добавить тебя в друзья`,
                    icon: 'bi-person-plus',
                    color: 'primary',
                    link: '#friends',
                    fromUserId: actorUid,
                    read: false,
                    createdAt
                });
                return { success: true };
            });
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('unavailable', 'Не удалось отправить заявку');
        }
    });

    const acceptFriendRequestV1 = onCall(options, async request => {
        const actorUid = requireActor(request, HttpsError);
        const targetUid = requireTarget(request.data, HttpsError);
        if (actorUid === targetUid) {
            throw new HttpsError('invalid-argument', 'Некорректная заявка');
        }

        const db = getFirestore();
        const actorRef = db.collection('users').doc(actorUid);
        const targetRef = db.collection('users').doc(targetUid);
        const incomingRef = actorRef.collection('friendRequests').doc(targetUid);
        const outgoingRef = targetRef.collection('sentRequests').doc(actorUid);
        const actorFriendRef = actorRef.collection('friends').doc(targetUid);
        const targetFriendRef = targetRef.collection('friends').doc(actorUid);
        const notificationRef = targetRef.collection('notifications').doc();

        try {
            return await db.runTransaction(async transaction => {
                const [actor, target, incoming, outgoing, actorFriend, targetFriend] = await Promise.all([
                    transaction.get(actorRef),
                    transaction.get(targetRef),
                    transaction.get(incomingRef),
                    transaction.get(outgoingRef),
                    transaction.get(actorFriendRef),
                    transaction.get(targetFriendRef)
                ]);
                if (!actor.exists || !target.exists || !incoming.exists || !outgoing.exists) {
                    throw new HttpsError('not-found', 'Заявка больше не существует');
                }
                const incomingData = incoming.data() || {};
                const outgoingData = outgoing.data() || {};
                if (incomingData.from !== targetUid || incomingData.to !== actorUid ||
                    incomingData.status !== 'pending' ||
                    outgoingData.from !== targetUid || outgoingData.to !== actorUid ||
                    outgoingData.status !== 'pending') {
                    throw new HttpsError('failed-precondition', 'Заявка не прошла проверку целостности');
                }
                if (actorFriend.exists || targetFriend.exists) {
                    throw new HttpsError('already-exists', 'Связь уже существует');
                }

                const addedAt = FieldValue.serverTimestamp();
                transaction.create(actorFriendRef, { friendId: targetUid, addedAt });
                transaction.create(targetFriendRef, { friendId: actorUid, addedAt });
                transaction.delete(incomingRef);
                transaction.delete(outgoingRef);
                incrementFriendCount(transaction, actorRef, actor, 1);
                incrementFriendCount(transaction, targetRef, target, 1);
                transaction.create(notificationRef, {
                    type: 'friend_accepted',
                    title: 'Заявка принята',
                    message: `${profileLabel(actor)} принял твою заявку в друзья`,
                    icon: 'bi-person-check',
                    color: 'success',
                    link: `#profile/${actorUid}`,
                    fromUserId: actorUid,
                    read: false,
                    createdAt: FieldValue.serverTimestamp()
                });
                return { success: true };
            });
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('unavailable', 'Не удалось принять заявку');
        }
    });

    async function deleteFriendRequest(request, mode) {
        const actorUid = requireActor(request, HttpsError);
        const targetUid = requireTarget(request.data, HttpsError);
        if (actorUid === targetUid) {
            throw new HttpsError('invalid-argument', 'Некорректная заявка');
        }

        const senderUid = mode === 'cancel' ? actorUid : targetUid;
        const recipientUid = mode === 'cancel' ? targetUid : actorUid;
        const db = getFirestore();
        const recipientRef = db.collection('users').doc(recipientUid);
        const senderRef = db.collection('users').doc(senderUid);
        const incomingRef = recipientRef.collection('friendRequests').doc(senderUid);
        const outgoingRef = senderRef.collection('sentRequests').doc(recipientUid);

        try {
            return await db.runTransaction(async transaction => {
                const [incoming, outgoing] = await Promise.all([
                    transaction.get(incomingRef),
                    transaction.get(outgoingRef)
                ]);
                if (!incoming.exists || !outgoing.exists) {
                    throw new HttpsError('not-found', 'Заявка больше не существует');
                }
                const incomingData = incoming.data() || {};
                const outgoingData = outgoing.data() || {};
                if (incomingData.from !== senderUid || incomingData.to !== recipientUid ||
                    incomingData.status !== 'pending' ||
                    outgoingData.from !== senderUid || outgoingData.to !== recipientUid ||
                    outgoingData.status !== 'pending') {
                    throw new HttpsError('failed-precondition', 'Заявка не прошла проверку целостности');
                }
                transaction.delete(incomingRef);
                transaction.delete(outgoingRef);
                return { success: true };
            });
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('unavailable', 'Не удалось обработать заявку');
        }
    }

    const rejectFriendRequestV1 = onCall(options, request => deleteFriendRequest(request, 'reject'));
    const cancelFriendRequestV1 = onCall(options, request => deleteFriendRequest(request, 'cancel'));

    const removeFriendV1 = onCall(options, async request => {
        const actorUid = requireActor(request, HttpsError);
        const targetUid = requireTarget(request.data, HttpsError);
        if (actorUid === targetUid) {
            throw new HttpsError('invalid-argument', 'Некорректный пользователь');
        }

        const db = getFirestore();
        const actorRef = db.collection('users').doc(actorUid);
        const targetRef = db.collection('users').doc(targetUid);
        const actorFriendRef = actorRef.collection('friends').doc(targetUid);
        const targetFriendRef = targetRef.collection('friends').doc(actorUid);

        try {
            return await db.runTransaction(async transaction => {
                const [actor, target, actorFriend, targetFriend] = await Promise.all([
                    transaction.get(actorRef),
                    transaction.get(targetRef),
                    transaction.get(actorFriendRef),
                    transaction.get(targetFriendRef)
                ]);
                if (!actor.exists || !target.exists ||
                    (!actorFriend.exists && !targetFriend.exists)) {
                    throw new HttpsError('not-found', 'Связь не найдена');
                }
                if (actorFriend.exists) {
                    transaction.delete(actorFriendRef);
                    incrementFriendCount(transaction, actorRef, actor, -1);
                }
                if (targetFriend.exists) {
                    transaction.delete(targetFriendRef);
                    incrementFriendCount(transaction, targetRef, target, -1);
                }
                return { success: true };
            });
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('unavailable', 'Не удалось удалить друга');
        }
    });

    return Object.freeze({
        sendFriendRequestV1,
        acceptFriendRequestV1,
        rejectFriendRequestV1,
        cancelFriendRequestV1,
        removeFriendV1
    });
}

export { createFriendCallables };
