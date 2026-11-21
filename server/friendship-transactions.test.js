import test from 'node:test';
import assert from 'node:assert/strict';
import { mutateFriendship } from './friendship-transactions.js';

function fixture(seed = {}) {
    const docs = new Map(Object.entries(seed));
    const writes = [];
    const reads = [];
    const ref = path => ({
        path,
        collection(name) { return ref(`${path}/${name}`); },
        doc(id) { return ref(`${path}/${id}`); }
    });
    const db = {
        collection(name) { return ref(name); },
        async runTransaction(callback) {
            const tx = {
                async get(document) {
                    reads.push(document.path);
                    const value = docs.get(document.path);
                    return {
                        exists: value !== undefined,
                        data: () => value
                    };
                },
                create(document, value) {
                    writes.push({ type: 'create', path: document.path, value });
                    docs.set(document.path, value);
                },
                set(document, value) {
                    writes.push({ type: 'set', path: document.path, value });
                    docs.set(document.path, value);
                },
                delete(document) {
                    writes.push({ type: 'delete', path: document.path });
                    docs.delete(document.path);
                }
            };
            return callback(tx);
        }
    };
    return { db, docs, writes, reads };
}

const timestamp = () => 'SERVER_TIME';
const paths = {
    incoming: 'users/bob/friendRequests/alice',
    outgoing: 'users/alice/sentRequests/bob',
    reverseIncoming: 'users/alice/friendRequests/bob',
    reverseOutgoing: 'users/bob/sentRequests/alice',
    ownFriend: 'users/alice/friends/bob',
    targetFriend: 'users/bob/friends/alice',
    requestNotification: 'users/bob/notifications/friend_request_alice',
    acceptedNotification: 'users/alice/notifications/friend_accepted_bob',
    incomingRequestNotification: 'users/bob/notifications/friend_request_alice'
};
const request = { from: 'alice', to: 'bob', status: 'pending', createdAt: 'CREATED' };

test('send creates matching incoming and outgoing requests atomically', async () => {
    const state = fixture();
    assert.deepEqual(await mutateFriendship(state.db, 'alice', 'bob', 'send', timestamp), { ok: true, action: 'send' });
    assert.deepEqual(state.writes.map(x => [x.type, x.path]), [
        ['create', paths.incoming], ['create', paths.outgoing], ['set', paths.requestNotification]
    ]);
    assert.deepEqual(state.docs.get(paths.incoming), { ...request, createdAt: 'SERVER_TIME' });
    assert.deepEqual(state.docs.get(paths.outgoing), state.docs.get(paths.incoming));
    assert.deepEqual(state.docs.get(paths.requestNotification), {
        type: 'friend_request',
        title: 'Новая заявка в друзья',
        message: 'Пользователь хочет добавить тебя в друзья',
        icon: 'bi-person-plus', color: 'primary', link: '#friends',
        fromUserId: 'alice', read: false, createdAt: 'SERVER_TIME'
    });
});

test('send rejects existing, reverse and already-friend relationships without writes', async () => {
    for (const seed of [
        { [paths.outgoing]: request },
        { [paths.reverseIncoming]: { ...request, from: 'bob', to: 'alice' } },
        { [paths.ownFriend]: { friendId: 'bob' } },
        { [paths.targetFriend]: { friendId: 'alice' } }
    ]) {
        const state = fixture(seed);
        const result = await mutateFriendship(state.db, 'alice', 'bob', 'send', timestamp);
        assert.equal(result.ok, false);
        assert.equal(state.writes.length, 0);
    }
});

test('accept validates the recipient-owned pending request and creates symmetric friendship', async () => {
    const incomingPath = 'users/alice/friendRequests/bob';
    const outgoingPath = 'users/alice/sentRequests/bob';
    const incoming = { ...request, from: 'alice', to: 'bob' };
    const outgoing = { ...request };
    const state = fixture({
        [incomingPath]: incoming,
        [outgoingPath]: outgoing,
        [paths.incomingRequestNotification]: { type: 'friend_request', read: false }
    });
    assert.deepEqual(await mutateFriendship(state.db, 'bob', 'alice', 'accept', timestamp), { ok: true, action: 'accept' });
    assert.equal(state.docs.get('users/bob/friends/alice').friendId, 'alice');
    assert.equal(state.docs.get('users/alice/friends/bob').friendId, 'bob');
    assert.equal(state.docs.has(incomingPath), false);
    assert.equal(state.docs.has(outgoingPath), false);
    assert.equal(state.docs.has(paths.incomingRequestNotification), false);
    assert.equal(state.writes.filter(x => x.type === 'create').length, 2);
    assert.deepEqual(state.docs.get(paths.acceptedNotification), {
        type: 'friend_accepted',
        title: 'Заявка принята',
        message: 'Твоя заявка в друзья принята',
        icon: 'bi-person-check', color: 'success', link: '#profile/bob',
        fromUserId: 'bob', read: false, createdAt: 'SERVER_TIME'
    });
});

test('reject removes only a validated incoming request and its matching sent index', async () => {
    const incomingPath = 'users/alice/friendRequests/bob';
    const outgoingPath = 'users/alice/sentRequests/bob';
    const state = fixture({
        [incomingPath]: { ...request, from: 'alice', to: 'bob' },
        [outgoingPath]: request,
        [paths.incomingRequestNotification]: { type: 'friend_request', read: false }
    });
    assert.deepEqual(await mutateFriendship(state.db, 'bob', 'alice', 'reject', timestamp), { ok: true, action: 'reject' });
    assert.equal(state.docs.has(incomingPath), false);
    assert.equal(state.docs.has(outgoingPath), false);
    assert.equal(state.docs.has(paths.incomingRequestNotification), false);
    assert.equal(state.writes.length, 3);
});

test('sender can cancel their own outgoing request', async () => {
    const state = fixture({
        [paths.outgoing]: request,
        [paths.incoming]: { ...request, from: 'alice', to: 'bob' },
        [paths.requestNotification]: { type: 'friend_request', read: false }
    });
    assert.deepEqual(await mutateFriendship(state.db, 'alice', 'bob', 'cancel', timestamp), { ok: true, action: 'cancel' });
    assert.equal(state.docs.has(paths.incoming), false);
    assert.equal(state.docs.has(paths.outgoing), false);
    assert.equal(state.docs.has(paths.requestNotification), false);
});

test('remove deletes only a verified symmetric friendship', async () => {
    const state = fixture({
        [paths.ownFriend]: { friendId: 'bob' },
        [paths.targetFriend]: { friendId: 'alice' }
    });
    assert.deepEqual(await mutateFriendship(state.db, 'alice', 'bob', 'remove', timestamp), { ok: true, action: 'remove' });
    assert.equal(state.docs.has(paths.ownFriend), false);
    assert.equal(state.docs.has(paths.targetFriend), false);
});

test('missing, malformed and asymmetric relationships fail closed', async () => {
    const cases = [
        ['accept', {}],
        ['accept', { 'users/alice/friendRequests/bob': { ...request, from: 'alice', to: 'bob' } }],
        ['reject', { 'users/alice/friendRequests/bob': { ...request, from: 'mallory', to: 'bob' }, 'users/alice/sentRequests/bob': request }],
        ['cancel', { [paths.outgoing]: { ...request, from: 'mallory', to: 'bob' } }],
        ['remove', { [paths.ownFriend]: { friendId: 'bob' } }],
        ['remove', {
            [paths.ownFriend]: { friendId: 'mallory' },
            [paths.targetFriend]: { friendId: 'alice' }
        }]
    ];
    for (const [action, seed] of cases) {
        const state = fixture(seed);
        const uid = action === 'accept' || action === 'reject' ? 'bob' : 'alice';
        const target = action === 'accept' || action === 'reject' ? 'alice' : 'bob';
        const result = await mutateFriendship(state.db, uid, target, action, timestamp);
        assert.equal(result.ok, false);
        assert.equal(state.writes.length, 0);
    }
});

test('invalid IDs, action and timestamp provider are rejected before database access', async () => {
    const state = fixture();
    assert.deepEqual(await mutateFriendship(state.db, 'alice', 'bad/id', 'send', timestamp), { ok: false, code: 'invalid-argument' });
    assert.deepEqual(await mutateFriendship(state.db, 'alice', 'bob', 'unknown', timestamp), { ok: false, code: 'invalid-argument' });
    assert.deepEqual(await mutateFriendship(state.db, 'alice', 'bob', 'send', null), { ok: false, code: 'invalid-argument' });
    assert.equal(state.reads.length, 0);
});
