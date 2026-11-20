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
        targetFriend: target.collection('friends').doc(uid)
    };

    return db.runTransaction(async tx => {
        const read = async names => Promise.all(names.map(name => tx.get(refs[name])));
        const get = (snapshots, names, name) => snapshots[names.indexOf(name)];
        const exists = (snapshots, names, name) => get(snapshots, names, name)?.exists === true;
        const data = (snapshots, names, name) => get(snapshots, names, name)?.data?.() || {};

        if (action === 'send') {
            const names = ['outgoing', 'reverseIncoming', 'ownFriend', 'targetFriend'];
            const snapshots = await read(names);
            if (exists(snapshots, names, 'ownFriend') || exists(snapshots, names, 'targetFriend')) {
                return resultError('already-exists');
            }
            if (exists(snapshots, names, 'outgoing') || exists(snapshots, names, 'reverseIncoming')) {
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
            return { ok: true, action };
        }

        if (action === 'accept' || action === 'reject') {
            const names = ['incoming', 'outgoing', 'ownFriend', 'targetFriend'];
            const snapshots = await read(names);
            if (!exists(snapshots, names, 'incoming')) return resultError('not-found');
            const request = data(snapshots, names, 'incoming');
            if (request.from !== targetUid || request.to !== uid || request.status !== 'pending') {
                return resultError('failed-precondition');
            }
            if (action === 'accept') {
                if (exists(snapshots, names, 'ownFriend') || exists(snapshots, names, 'targetFriend')) {
                    return resultError('already-exists');
                }
                const addedAt = serverTimestamp();
                tx.create(refs.ownFriend, { friendId: targetUid, addedAt });
                tx.create(refs.targetFriend, { friendId: uid, addedAt });
            }
            tx.delete(refs.incoming);
            if (exists(snapshots, names, 'outgoing')) tx.delete(refs.outgoing);
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
            tx.delete(refs.outgoing);
            if (exists(snapshots, names, 'incoming')) tx.delete(refs.incoming);
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
