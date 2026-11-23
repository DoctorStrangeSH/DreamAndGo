import test from 'node:test';
import assert from 'node:assert/strict';
import { createFriendCallables } from './friends-callables.js';

class TestHttpsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function setup(seed = {}) {
    const records = new Map(Object.entries({
        'users/user-a': { username: 'alice', stats: { friends: 0 } },
        'users/user-b': { username: 'bob', stats: { friends: 0 } },
        ...seed
    }));
    const registrations = [];
    let autoId = 0;
    const makeRef = path => ({
        path,
        collection(name) {
            return { doc: id => makeRef(`${path}/${name}/${id}`) };
        }
    });
    const db = {
        collection(name) {
            return { doc: id => makeRef(`${name}/${id || `auto-${++autoId}`}`) };
        },
        async runTransaction(callback) {
            const writes = [];
            const transaction = {
                async get(ref) {
                    const value = records.get(ref.path);
                    return {
                        exists: value !== undefined,
                        data: () => value
                    };
                },
                create(ref, data) { writes.push({ type: 'create', path: ref.path, data }); },
                update(ref, data) { writes.push({ type: 'update', path: ref.path, data }); },
                delete(ref) { writes.push({ type: 'delete', path: ref.path }); }
            };
            const result = await callback(transaction);
            for (const write of writes) {
                if (write.type === 'create') {
                    if (records.has(write.path)) throw new Error('already exists');
                    records.set(write.path, write.data);
                } else if (write.type === 'delete') {
                    records.delete(write.path);
                } else {
                    const current = records.get(write.path) || {};
                    const next = structuredClone(current);
                    for (const [key, value] of Object.entries(write.data)) {
                        if (key === 'stats.friends') {
                            next.stats = { ...(next.stats || {}), friends: value };
                        } else next[key] = value;
                    }
                    records.set(write.path, next);
                }
            }
            return result;
        }
    };
    const dependencies = {
        onCall(options, handler) {
            registrations.push({ options, handler });
            return handler;
        },
        HttpsError: TestHttpsError,
        getFirestore: () => db,
        FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' }
    };
    return {
        records,
        registrations,
        callables: createFriendCallables(dependencies)
    };
}

test('all friend callables enforce App Check in europe-west3', () => {
    const ctx = setup();
    assert.equal(ctx.registrations.length, 5);
    for (const item of ctx.registrations) {
        assert.deepEqual(item.options, { region: 'europe-west3', enforceAppCheck: true });
    }
});

test('sending a request derives sender from auth and writes both inbox/outbox plus trusted notification', async () => {
    const ctx = setup();
    const result = await ctx.callables.sendFriendRequestV1({
        auth: { uid: 'user-a' },
        data: { targetUid: 'user-b' }
    });
    assert.deepEqual(result, { success: true });
    assert.equal(ctx.records.get('users/user-b/friendRequests/user-a').from, 'user-a');
    assert.equal(ctx.records.get('users/user-a/sentRequests/user-b').to, 'user-b');
    const notifications = [...ctx.records.entries()].filter(([path]) => path.startsWith('users/user-b/notifications/'));
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0][1].type, 'friend_request');
    assert.equal(notifications[0][1].message, '@alice хочет добавить тебя в друзья');
});

test('friend request rejects unauthenticated callers, extra fields, self-add and duplicate requests', async () => {
    const ctx = setup();
    await assert.rejects(ctx.callables.sendFriendRequestV1({ data: { targetUid: 'user-b' } }),
        error => error.code === 'unauthenticated');
    await assert.rejects(ctx.callables.sendFriendRequestV1({
        auth: { uid: 'user-a' }, data: { targetUid: 'user-b', fromUserId: 'user-c' }
    }), error => error.code === 'invalid-argument');
    await assert.rejects(ctx.callables.sendFriendRequestV1({
        auth: { uid: 'user-a' }, data: { targetUid: 'user-a' }
    }), error => error.code === 'failed-precondition');
    await ctx.callables.sendFriendRequestV1({ auth: { uid: 'user-a' }, data: { targetUid: 'user-b' } });
    await assert.rejects(ctx.callables.sendFriendRequestV1({
        auth: { uid: 'user-a' }, data: { targetUid: 'user-b' }
    }), error => error.code === 'already-exists');
});

test('only the recipient can accept and acceptance creates reciprocal friendship atomically', async () => {
    const ctx = setup();
    await ctx.callables.sendFriendRequestV1({ auth: { uid: 'user-a' }, data: { targetUid: 'user-b' } });
    await assert.rejects(ctx.callables.acceptFriendRequestV1({
        auth: { uid: 'user-a' }, data: { targetUid: 'user-b' }
    }), error => error.code === 'not-found');
    const result = await ctx.callables.acceptFriendRequestV1({
        auth: { uid: 'user-b' }, data: { targetUid: 'user-a' }
    });
    assert.deepEqual(result, { success: true });
    assert.equal(ctx.records.get('users/user-a/friends/user-b').friendId, 'user-b');
    assert.equal(ctx.records.get('users/user-b/friends/user-a').friendId, 'user-a');
    assert.equal(ctx.records.has('users/user-b/friendRequests/user-a'), false);
    assert.equal(ctx.records.has('users/user-a/sentRequests/user-b'), false);
    assert.equal(ctx.records.get('users/user-a').stats.friends, 1);
    assert.equal(ctx.records.get('users/user-b').stats.friends, 1);
    const notifications = [...ctx.records.entries()].filter(([path]) => path.startsWith('users/user-a/notifications/'));
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0][1].type, 'friend_accepted');
});

test('acceptance rejects forged or inconsistent legacy request records', async () => {
    const ctx = setup({
        'users/user-b/friendRequests/user-a': {
            from: 'user-c', to: 'user-b', status: 'pending'
        },
        'users/user-a/sentRequests/user-b': {
            from: 'user-a', to: 'user-b', status: 'pending'
        }
    });
    await assert.rejects(ctx.callables.acceptFriendRequestV1({
        auth: { uid: 'user-b' }, data: { targetUid: 'user-a' }
    }), error => error.code === 'failed-precondition');
    assert.equal(ctx.records.has('users/user-b/friendRequests/user-a'), true);
    assert.equal(ctx.records.has('users/user-a/friends/user-b'), false);
});

test('reject and cancel remove only the request addressed by the authenticated actor', async () => {
    const rejected = setup();
    await rejected.callables.sendFriendRequestV1({ auth: { uid: 'user-a' }, data: { targetUid: 'user-b' } });
    await rejected.callables.rejectFriendRequestV1({ auth: { uid: 'user-b' }, data: { targetUid: 'user-a' } });
    assert.equal(rejected.records.has('users/user-b/friendRequests/user-a'), false);
    assert.equal(rejected.records.has('users/user-a/sentRequests/user-b'), false);

    const cancelled = setup();
    await cancelled.callables.sendFriendRequestV1({ auth: { uid: 'user-a' }, data: { targetUid: 'user-b' } });
    await cancelled.callables.cancelFriendRequestV1({ auth: { uid: 'user-a' }, data: { targetUid: 'user-b' } });
    assert.equal(cancelled.records.has('users/user-b/friendRequests/user-a'), false);
    assert.equal(cancelled.records.has('users/user-a/sentRequests/user-b'), false);
});

test('removing a friendship deletes both sides and clamps counters at zero', async () => {
    const ctx = setup({
        'users/user-a': { username: 'alice', stats: { friends: 1 } },
        'users/user-b': { username: 'bob', stats: { friends: 1 } },
        'users/user-a/friends/user-b': { friendId: 'user-b' },
        'users/user-b/friends/user-a': { friendId: 'user-a' }
    });
    const result = await ctx.callables.removeFriendV1({
        auth: { uid: 'user-a' }, data: { targetUid: 'user-b' }
    });
    assert.deepEqual(result, { success: true });
    assert.equal(ctx.records.has('users/user-a/friends/user-b'), false);
    assert.equal(ctx.records.has('users/user-b/friends/user-a'), false);
    assert.equal(ctx.records.get('users/user-a').stats.friends, 0);
    assert.equal(ctx.records.get('users/user-b').stats.friends, 0);
});

test('removing a one-sided legacy friendship only decrements the owner with a real record', async () => {
    const actorOwnsRecord = setup({
        'users/user-a': { username: 'alice', stats: { friends: 2 } },
        'users/user-b': { username: 'bob', stats: { friends: 5 } },
        'users/user-a/friends/user-b': { friendId: 'user-b' }
    });
    await actorOwnsRecord.callables.removeFriendV1({
        auth: { uid: 'user-a' }, data: { targetUid: 'user-b' }
    });
    assert.equal(actorOwnsRecord.records.get('users/user-a').stats.friends, 1);
    assert.equal(actorOwnsRecord.records.get('users/user-b').stats.friends, 5);
    assert.equal(actorOwnsRecord.records.has('users/user-a/friends/user-b'), false);

    const targetOwnsRecord = setup({
        'users/user-a': { username: 'alice', stats: { friends: 4 } },
        'users/user-b': { username: 'bob', stats: { friends: 3 } },
        'users/user-b/friends/user-a': { friendId: 'user-a' }
    });
    await targetOwnsRecord.callables.removeFriendV1({
        auth: { uid: 'user-a' }, data: { targetUid: 'user-b' }
    });
    assert.equal(targetOwnsRecord.records.get('users/user-a').stats.friends, 4);
    assert.equal(targetOwnsRecord.records.get('users/user-b').stats.friends, 2);
    assert.equal(targetOwnsRecord.records.has('users/user-b/friends/user-a'), false);
});

test('factory rejects incomplete dependencies', () => {
    assert.throws(() => createFriendCallables({}), TypeError);
});
