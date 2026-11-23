import test from 'node:test';
import assert from 'node:assert/strict';
import { createFriendReadCallables } from './friends-read-callables.js';

class TestHttpsError extends Error {
    constructor(code, message) { super(message); this.code = code; }
}

function setup() {
    const registrations = [];
    const docs = {
        'users/alice/friends': [
            { id: 'bob', data: () => ({ addedAt: new Date('2026-11-20T10:00:00.000Z') }) },
            { id: 'carol', data: () => ({ addedAt: new Date('2026-11-20T11:00:00.000Z') }) },
            { id: '_init', data: () => ({}) }
        ],
        'users/alice/friendRequests': [
            { id: 'carol', data: () => ({ createdAt: new Date('2026-11-21T10:00:00.000Z') }) }
        ],
        'users/alice/sentRequests': [
            { id: 'dave', data: () => ({ createdAt: new Date('2026-11-22T10:00:00.000Z') }) }
        ]
    };
    const reciprocalFriends = new Set(['users/bob/friends/alice']);
    const profiles = {
        bob: { username: 'bob', displayName: 'Bob', avatar: 'https://example.test/bob.png', bio: 'Hello', stats: { books: 4, movies: 2, travels: 1, privateField: 'never-return' } },
        carol: { username: 'carol', displayName: 'Carol', email: 'private@example.test' },
        dave: { username: 'dave', stats: { books: 3 } }
    };
    const db = {
        collection(name) {
            return {
                doc(id) {
                    const path = `${name}/${id}`;
                    return {
                        collection(child) {
                            return {
                                doc(childId) {
                                    const childPath = `${path}/${child}/${childId}`;
                                    return {
                                        async get() {
                                            const exists = reciprocalFriends.has(childPath);
                                            return { exists, data: () => exists ? { friendId: childId } : undefined };
                                        }
                                    };
                                },
                                limit(count) {
                                    assert.equal(count, 101);
                                    return { async get() { return { docs: docs[`${path}/${child}`] || [] }; } };
                                }
                            };
                        },
                        async get() {
                            const value = name === 'publicProfiles' ? profiles[id] : null;
                            return { exists: Boolean(value), data: () => value };
                        }
                    };
                }
            };
        }
    };
    const callables = createFriendReadCallables({
        onCall(options, handler) { registrations.push({ options, handler }); return handler; },
        HttpsError: TestHttpsError,
        getFirestore: () => db
    });
    return { callables, registrations };
}

test('friend list read callables enforce App Check and a fixed region', () => {
    const { registrations } = setup();
    assert.equal(registrations.length, 3);
    for (const item of registrations) {
        assert.deepEqual(item.options, { region: 'europe-west3', enforceAppCheck: true });
    }
});

test('friends, incoming requests and outgoing requests return only allowlisted public profile fields', async () => {
    const { callables } = setup();
    const auth = { uid: 'alice' };
    const [friends, incoming, outgoing] = await Promise.all([
        callables.getMyFriendsV1({ auth, data: {} }),
        callables.getMyFriendRequestsV1({ auth, data: {} }),
        callables.getMySentFriendRequestsV1({ auth, data: {} })
    ]);

    assert.equal(friends.items.length, 1);
    assert.deepEqual(friends.items[0], {
        uid: 'bob', username: 'bob', displayName: 'Bob',
        avatar: 'https://example.test/bob.png', bio: 'Hello',
        stats: { travels: 1, movies: 2, books: 4 },
        addedAt: '2026-11-20T10:00:00.000Z'
    });
    assert.equal(incoming.items[0].uid, 'carol');
    assert.equal(incoming.items[0].createdAt, '2026-11-21T10:00:00.000Z');
    assert.equal(outgoing.items[0].uid, 'dave');
    assert.equal(outgoing.items[0].createdAt, '2026-11-22T10:00:00.000Z');
    assert.equal(JSON.stringify(friends).includes('privateField'), false);
    assert.equal(JSON.stringify(incoming).includes('email'), false);
});

test('friend list excludes orphaned one-sided relationship records', async () => {
    const { callables } = setup();
    const result = await callables.getMyFriendsV1({
        auth: { uid: 'alice' }, data: {}
    });
    assert.deepEqual(result.items.map(item => item.uid), ['bob']);
    assert.equal(result.items.some(item => item.uid === 'carol'), false);
});

test('friend list reads reject anonymous callers and client-selected UIDs or extra payload fields', async () => {
    const { callables } = setup();
    await assert.rejects(callables.getMyFriendsV1({ data: {} }),
        error => error.code === 'unauthenticated');
    await assert.rejects(callables.getMyFriendsV1({
        auth: { uid: 'alice' }, data: { uid: 'victim' }
    }), error => error.code === 'invalid-argument');
});

test('friend list factory rejects incomplete dependencies', () => {
    assert.throws(() => createFriendReadCallables({}), TypeError);
});
