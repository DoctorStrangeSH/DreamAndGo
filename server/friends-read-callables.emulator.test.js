import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createFriendReadCallables } from './friends-read-callables.js';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const available = Boolean(emulatorHost);
const projectId = process.env.GCLOUD_PROJECT || 'demo-dream-and-go';
let app;
let db;
let endpoints;
const createdUsers = [];

class EmulatorHttpsError extends Error {
    constructor(code, message) { super(message); this.code = code; }
}

function uniqueId() {
    return randomBytes(8).toString('hex');
}

async function seedPair() {
    const suffix = uniqueId();
    const alice = `friends-a-${suffix}`;
    const bob = `friends-b-${suffix}`;
    const carol = `friends-c-${suffix}`;

    await Promise.all([
        db.collection('users').doc(alice).set({ email: 'alice-private@example.test', stats: { friends: 1 } }),
        db.collection('users').doc(bob).set({ email: 'bob-private@example.test' }),
        db.collection('users').doc(carol).set({ email: 'carol-private@example.test' }),
        db.collection('publicProfiles').doc(bob).set({
            username: 'bob', displayName: 'Bob', avatar: 'https://example.test/bob.png',
            bio: 'Public bio', email: 'must-not-leak@example.test',
            stats: { travels: 3, movies: 4, books: 5, friends: 1, privateScore: 999 }
        }),
        db.collection('publicProfiles').doc(carol).set({
            username: 'carol', displayName: 'Carol', email: 'must-not-leak@example.test',
            stats: { books: 2 }
        }),
        db.collection('users').doc(alice).collection('friends').doc(bob).set({
            friendId: bob, addedAt: FieldValue.serverTimestamp()
        }),
        db.collection('users').doc(alice).collection('friendRequests').doc(carol).set({
            from: carol, to: alice, status: 'pending', createdAt: FieldValue.serverTimestamp()
        }),
        db.collection('users').doc(alice).collection('sentRequests').doc(bob).set({
            from: alice, to: bob, status: 'pending', createdAt: FieldValue.serverTimestamp()
        })
    ]);
    createdUsers.push(alice, bob, carol);
    return { alice, bob, carol };
}

before(async () => {
    if (!available) return;
    assert.match(emulatorHost, /^(127\.0\.0\.1|localhost):\d+$/);
    app = initializeApp({ projectId }, `friends-read-emulator-${process.pid}`);
    db = getFirestore(app);
    const registrations = [];
    endpoints = createFriendReadCallables({
        onCall(options, handler) {
            registrations.push({ options, handler });
            return handler;
        },
        HttpsError: EmulatorHttpsError,
        getFirestore: () => db
    });
    assert.equal(registrations.length, 3);
    assert.ok(registrations.every(item => item.options.enforceAppCheck === true));
    assert.ok(registrations.every(item => item.options.region === 'europe-west3'));
});

after(async () => {
    if (!db) return;
    await Promise.all(createdUsers.map(uid => db.recursiveDelete(db.collection('users').doc(uid)).catch(() => {})));
    await Promise.all(createdUsers.map(uid => db.collection('publicProfiles').doc(uid).delete().catch(() => {})));
    if (app) await deleteApp(app);
});

test('Firestore Emulator friend lists are scoped to authenticated owner and expose only public allowlisted fields', { skip: !available }, async () => {
    const { alice, bob, carol } = await seedPair();
    const [friends, incoming, outgoing] = await Promise.all([
        endpoints.getMyFriendsV1({ auth: { uid: alice }, data: {} }),
        endpoints.getMyFriendRequestsV1({ auth: { uid: alice }, data: {} }),
        endpoints.getMySentFriendRequestsV1({ auth: { uid: alice }, data: {} })
    ]);

    assert.equal(friends.items.length, 1);
    assert.equal(friends.items[0].uid, bob);
    assert.equal(friends.items[0].username, 'bob');
    assert.equal(friends.items[0].stats.books, 5);
    assert.equal(friends.items[0].stats.friends, undefined);
    assert.equal(incoming.items.length, 1);
    assert.equal(incoming.items[0].uid, carol);
    assert.equal(outgoing.items.length, 1);
    assert.equal(outgoing.items[0].uid, bob);
    for (const result of [friends, incoming, outgoing]) {
        assert.equal(JSON.stringify(result).includes('email'), false);
        assert.equal(JSON.stringify(result).includes('privateScore'), false);
    }

    const otherOwner = await endpoints.getMyFriendsV1({ auth: { uid: bob }, data: {} });
    assert.deepEqual(otherOwner.items, []);
    await assert.rejects(endpoints.getMyFriendsV1({ data: {} }),
        error => error.code === 'unauthenticated');
    await assert.rejects(endpoints.getMyFriendsV1({
        auth: { uid: alice }, data: { uid: bob }
    }), error => error.code === 'invalid-argument');
});
