import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createFriendCallables } from './friends-callables.js';

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

async function createPair() {
    const suffix = uniqueId();
    const alice = `friend-action-a-${suffix}`;
    const bob = `friend-action-b-${suffix}`;
    await Promise.all([
        db.collection('users').doc(alice).set({ username: 'alice', stats: { friends: 0 } }),
        db.collection('users').doc(bob).set({ username: 'bob', stats: { friends: 0 } }),
        db.collection('publicProfiles').doc(alice).set({ username: 'alice', displayName: 'Alice' }),
        db.collection('publicProfiles').doc(bob).set({ username: 'bob', displayName: 'Bob' })
    ]);
    createdUsers.push(alice, bob);
    return { alice, bob };
}

async function readUser(uid) {
    const snapshot = await db.collection('users').doc(uid).get();
    return snapshot.data();
}

before(async () => {
    if (!available) return;
    assert.match(emulatorHost, /^(127\.0\.0\.1|localhost):\d+$/);
    app = initializeApp({ projectId }, `friends-actions-emulator-${process.pid}`);
    db = getFirestore(app);
    const registrations = [];
    endpoints = createFriendCallables({
        onCall(options, handler) {
            registrations.push({ options, handler });
            return handler;
        },
        HttpsError: EmulatorHttpsError,
        getFirestore: () => db,
        FieldValue
    });
    assert.equal(registrations.length, 5);
    assert.ok(registrations.every(item => item.options.enforceAppCheck === true));
    assert.ok(registrations.every(item => item.options.region === 'europe-west3'));
});

after(async () => {
    if (!db) return;
    await Promise.all(createdUsers.map(uid => db.recursiveDelete(db.collection('users').doc(uid)).catch(() => {})));
    await Promise.all(createdUsers.map(uid => db.collection('publicProfiles').doc(uid).delete().catch(() => {})));
    if (app) await deleteApp(app);
});

test('Firestore Emulator friend request lifecycle keeps reciprocal records and counters consistent', { skip: !available }, async () => {
    const { alice, bob } = await createPair();

    await endpoints.sendFriendRequestV1({ auth: { uid: alice }, data: { targetUid: bob } });
    let incoming = await db.collection('users').doc(bob).collection('friendRequests').doc(alice).get();
    let outgoing = await db.collection('users').doc(alice).collection('sentRequests').doc(bob).get();
    assert.equal(incoming.data().status, 'pending');
    assert.equal(outgoing.data().status, 'pending');

    await endpoints.acceptFriendRequestV1({ auth: { uid: bob }, data: { targetUid: alice } });
    const [aliceFriend, bobFriend, aliceAfterAccept, bobAfterAccept] = await Promise.all([
        db.collection('users').doc(alice).collection('friends').doc(bob).get(),
        db.collection('users').doc(bob).collection('friends').doc(alice).get(),
        readUser(alice),
        readUser(bob)
    ]);
    assert.equal(aliceFriend.exists, true);
    assert.equal(bobFriend.exists, true);
    assert.equal(aliceAfterAccept.stats.friends, 1);
    assert.equal(bobAfterAccept.stats.friends, 1);
    assert.equal((await db.collection('users').doc(bob).collection('friendRequests').doc(alice).get()).exists, false);
    assert.equal((await db.collection('users').doc(alice).collection('sentRequests').doc(bob).get()).exists, false);

    await endpoints.removeFriendV1({ auth: { uid: alice }, data: { targetUid: bob } });
    const [aliceAfterRemove, bobAfterRemove] = await Promise.all([readUser(alice), readUser(bob)]);
    assert.equal((await db.collection('users').doc(alice).collection('friends').doc(bob).get()).exists, false);
    assert.equal((await db.collection('users').doc(bob).collection('friends').doc(alice).get()).exists, false);
    assert.equal(aliceAfterRemove.stats.friends, 0);
    assert.equal(bobAfterRemove.stats.friends, 0);
});

test('Firestore Emulator reject and cancel remove only their matching reciprocal request documents', { skip: !available }, async () => {
    const first = await createPair();
    await endpoints.sendFriendRequestV1({ auth: { uid: first.alice }, data: { targetUid: first.bob } });
    await endpoints.rejectFriendRequestV1({ auth: { uid: first.bob }, data: { targetUid: first.alice } });
    assert.equal((await db.collection('users').doc(first.bob).collection('friendRequests').doc(first.alice).get()).exists, false);
    assert.equal((await db.collection('users').doc(first.alice).collection('sentRequests').doc(first.bob).get()).exists, false);

    const second = await createPair();
    await endpoints.sendFriendRequestV1({ auth: { uid: second.alice }, data: { targetUid: second.bob } });
    await endpoints.cancelFriendRequestV1({ auth: { uid: second.alice }, data: { targetUid: second.bob } });
    assert.equal((await db.collection('users').doc(second.bob).collection('friendRequests').doc(second.alice).get()).exists, false);
    assert.equal((await db.collection('users').doc(second.alice).collection('sentRequests').doc(second.bob).get()).exists, false);
});
