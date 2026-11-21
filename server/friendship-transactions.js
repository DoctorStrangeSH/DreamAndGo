import { isValidFriendPair } from '../js/core/friend-action-policy.js';

const ACTIONS = new Set(['send', 'accept', 'reject', 'cancel', 'remove']);

function resultError(code) {
    return { ok: false, code };
}

export async function mutateFriendship(db, uid, targetUid, action, serverTimestamp) {
    if (!isValidFriendPair(uid, targetUid) || !ACTIONS.has(action) ||
        typeof serverTimestamp !== 'function') {
        return resultError('invalid-argument');
    }

    const own = db.collection('users').doc(uid);
    const target = db.collection('users').doc(targetUid);
    const refs = {
        outgoing: own.collection('sentRequests').doc(targetUid),
        incoming: target.collection('friendRequests').doc(uid),
        reverseIncoming: own.collection('friendRequests').doc(targetUid),
        reverseOutgoing: target.collection('sentRequests').doc(uid),
        ownFriend: own.collection('friends').doc(targetUid),
        targetFriend: target.collection('friends').doc(uid),
        requestNotification: target.collection('notifications').doc(`friend_request_${uid}`),
        incomingRequestNotification: own.collection('notifications').doc(`friend_request_${targetUid}`),
        acceptedNotification: target.collection('notifications').doc(`friend_accepted_${uid}`)
    };

    return db.runTransaction(async tx => {
        const read = async names => Promise.all(names.map(name => tx.get(refs[name])));
        const get = (snapshots, names, name) => snapshots[names.indexOf(name)];
        const exists = (snapshots, names, name) => get(snapshots, names, name)?.exists === true;
        const data = (snapshots, names, name) => get(snapshots, names, name)?.data?.() || {};

        if (action === 'send') {
            const names = ['outgoing', 'reverseIncoming', 'reverseOutgoing', 'ownFriend', 'targetFriend'];
            const snapshots = await read(names);
            if (exists(snapshots, names, 'ownFriend') || exists(snapshots, names, 'targetFriend')) {
                return resultError('already-exists');
            }
            if (exists(snapshots, names, 'outgoing') || exists(snapshots, names, 'reverseIncoming') ||
                exists(snapshots, names, 'reverseOutgoing')) {
                return resultError('failed-precondition');
            }
            const request = {
                from: uid,
                to: targetUid,
                status: 'pending',
                createdAt: serverTimestamp()
            };
            tx.create(refs.incoming, request);
            tx.create(refs.outgoing, request);
            tx.set(refs.requestNotification, {
                type: 'friend_request',
                title: 'Новая заявка в друзья',
                message: 'Пользователь хочет добавить тебя в друзья',
                icon: 'bi-person-plus',
                color: 'primary',
                link: '#friends',
                fromUserId: uid,
                read: false,
                createdAt: serverTimestamp()
            });
            return { ok: true, action };
        }

        if (action === 'accept' || action === 'reject') {
            const names = ['incoming', 'reverseOutgoing', 'ownFriend', 'targetFriend'];
            const snapshots = await read(names);
            if (!exists(snapshots, names, 'incoming') || !exists(snapshots, names, 'reverseOutgoing')) {
                return resultError('not-found');
            }
            const request = data(snapshots, names, 'incoming');
            const sentIndex = data(snapshots, names, 'reverseOutgoing');
            if (request.from !== targetUid || request.to !== uid || request.status !== 'pending' ||
                sentIndex.from !== targetUid || sentIndex.to !== uid || sentIndex.status !== 'pending') {
                return resultError('failed-precondition');
            }
            if (action === 'accept') {
                if (exists(snapshots, names, 'ownFriend') || exists(snapshots, names, 'targetFriend')) {
                    return resultError('already-exists');
                }
                const addedAt = serverTimestamp();
                tx.create(refs.ownFriend, { friendId: targetUid, addedAt });
                tx.create(refs.targetFriend, { friendId: uid, addedAt });
                tx.set(refs.acceptedNotification, {
                    type: 'friend_accepted',
                    title: 'Заявка принята',
                    message: 'Твоя заявка в друзья принята',
                    icon: 'bi-person-check',
                    color: 'success',
                    link: `#profile/${uid}`,
                    fromUserId: uid,
                    read: false,
                    createdAt: serverTimestamp()
                });
                tx.delete(refs.incomingRequestNotification);
            } else {
                tx.delete(refs.incomingRequestNotification);
            }
            tx.delete(refs.incoming);
            tx.delete(refs.reverseOutgoing);
            return { ok: true, action };
        }

        if (action === 'cancel') {
            const names = ['outgoing', 'incoming'];
            const snapshots = await read(names);
            if (!exists(snapshots, names, 'outgoing')) return resultError('not-found');
            const request = data(snapshots, names, 'outgoing');
            if (request.from !== uid || request.to !== targetUid || request.status !== 'pending') {
                return resultError('failed-precondition');
            }
            if (exists(snapshots, names, 'incoming')) {
                const incoming = data(snapshots, names, 'incoming');
                if (incoming.from !== uid || incoming.to !== targetUid || incoming.status !== 'pending') {
                    return resultError('failed-precondition');
                }
                tx.delete(refs.incoming);
            }
            tx.delete(refs.outgoing);
            tx.delete(refs.requestNotification);
            return { ok: true, action };
        }

        const names = ['ownFriend', 'targetFriend'];
        const snapshots = await read(names);
        if (!exists(snapshots, names, 'ownFriend') || !exists(snapshots, names, 'targetFriend')) {
            return resultError('not-found');
        }
        const ownFriend = data(snapshots, names, 'ownFriend');
        const targetFriend = data(snapshots, names, 'targetFriend');
        if (ownFriend.friendId !== targetUid || targetFriend.friendId !== uid) {
            return resultError('failed-precondition');
        }
        tx.delete(refs.ownFriend);
        tx.delete(refs.targetFriend);
        return { ok: true, action };
    });
}
