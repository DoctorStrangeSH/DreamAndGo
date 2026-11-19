import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sendPrivateMessageTransaction } from './chat-transactions.js';
import { markPrivateMessageReadTransaction } from './chat-read-receipts.js';
import { loadPrivateChatHistory } from './chat-history-service.js';
import { createFirestoreHistoryAdapter } from './chat-history-firestore.js';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Emulator required');
const app = initializeApp({ projectId: 'demo-dreamandgo-chat-rules' }, 'history-journey-tests');
const db = getFirestore(app);
const adapter = createFirestoreHistoryAdapter(db);
const uuid = n => `f50e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`;
let counter = 0;

async function setup() {
    const n = ++counter;
    const chatId = `history-journey-${n}`;
    const alice = `history-alice-${n}`;
    const bob = `history-bob-${n}`;
    await db.doc(`chats/${chatId}`).create({
        version: 2, state: 'active', participants: [alice, bob]
    });
    return { chatId, alice, bob };
}
async function send(x, uid, n, ms) {
    return sendPrivateMessageTransaction(db, uid, x.chatId,
        `message ${n}`, uuid(n), () => ms);
}
async function history(x, uid, beforeSequence = null, limit = 2) {
    return loadPrivateChatHistory(uid,
        { chatId: x.chatId, beforeSequence, limit }, adapter);
}

test('two users send, page through real Firestore history and persist read receipts', async () => {
    const x = await setup();
    const first = await send(x, x.alice, 601, 10000);
    const second = await send(x, x.bob, 602, 10000);
    const third = await send(x, x.alice, 603, 12000);
    const latest = await history(x, x.bob);
    assert.equal(latest.ok, true);
    assert.deepEqual(latest.messages.map(row => row.sequence), [3, 2]);
    assert.deepEqual(latest.messages.map(row => row.senderId), [x.alice, x.bob]);
    assert.equal(latest.hasMore, true);
    assert.equal(latest.nextBeforeSequence, 2);
    const older = await history(x, x.alice, latest.nextBeforeSequence);
    assert.deepEqual(older.messages.map(row => row.sequence), [1]);
    assert.equal(older.hasMore, false);
    assert.equal(older.nextBeforeSequence, null);
    assert.equal(older.messages[0].id, first.messageId);
    assert.equal(latest.messages[0].id, third.messageId);
    assert.equal(latest.messages[1].id, second.messageId);

    await markPrivateMessageReadTransaction(db, x.bob, x.chatId, first.messageId);
    const refreshed = await history(x, x.bob, 2);
    assert.equal(refreshed.messages[0].read, true);
    // Read status survives fresh queries; no client-local state is consulted.
    const afterReload = await history(x, x.alice, 2);
    assert.equal(afterReload.messages[0].read, true);
});

test('nonparticipants, both blocks and frozen chats prevent history reads', async () => {
    const x = await setup();
    await send(x, x.alice, 604, 10000);
    assert.deepEqual(await history(x, 'stranger'), {
        ok: false, code: 'permission-denied'
    });
    await db.doc(`users/${x.alice}/blockedUsers/${x.bob}`).set({ blocked: true });
    assert.deepEqual(await history(x, x.alice), {
        ok: false, code: 'permission-denied'
    });
    assert.deepEqual(await history(x, x.bob), {
        ok: false, code: 'permission-denied'
    });
    await db.doc(`users/${x.alice}/blockedUsers/${x.bob}`).delete();
    await db.doc(`users/${x.bob}/blockedUsers/${x.alice}`).set({ blocked: true });
    assert.deepEqual(await history(x, x.alice), {
        ok: false, code: 'permission-denied'
    });
    await db.doc(`users/${x.bob}/blockedUsers/${x.alice}`).delete();
    await db.doc(`chats/${x.chatId}`).update({ state: 'frozen' });
    assert.deepEqual(await history(x, x.alice), {
        ok: false, code: 'failed-precondition'
    });
});
test.after(async () => { await deleteApp(app); });


test('cursor pagination remains gap-free when a new message arrives between page requests', async () => {
    const x = await setup();
    const first = await send(x, x.alice, 701, 10_000);
    const second = await send(x, x.bob, 702, 10_000);
    const third = await send(x, x.alice, 703, 12_000);

    const initialPage = await history(x, x.bob, null, 2);
    assert.deepEqual(initialPage.messages.map(row => row.sequence), [3, 2]);
    assert.equal(initialPage.nextBeforeSequence, 2);

    const fourth = await send(x, x.bob, 704, 12_000);
    const olderPage = await history(x, x.alice, initialPage.nextBeforeSequence, 2);
    assert.deepEqual(olderPage.messages.map(row => row.sequence), [1]);
    assert.equal(olderPage.hasMore, false);

    const ids = [
        ...initialPage.messages.map(row => row.id),
        ...olderPage.messages.map(row => row.id)
    ];
    assert.equal(new Set(ids).size, 3);
    assert.deepEqual(new Set(ids), new Set([first.messageId, second.messageId, third.messageId]));
    const refreshedHead = await history(x, x.alice, null, 2);
    assert.deepEqual(refreshedHead.messages.map(row => row.sequence), [4, 3]);
    assert.equal(refreshedHead.messages[0].id, fourth.messageId);
});
