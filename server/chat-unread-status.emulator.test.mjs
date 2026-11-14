import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sendPrivateMessageTransaction } from './chat-transactions.js';
import { markPrivateMessageReadTransaction } from './chat-read-receipts.js';
import { getPrivateChatUnreadCount } from './chat-unread-status.js';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Emulator required');
const app = initializeApp({ projectId: 'demo-dreamandgo-chat-rules' }, 'unread-status-tests');
const db = getFirestore(app);
const uuid = n => `a50e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`;
let counter = 0;
async function setup() {
    const n = ++counter;
    const chatId = `unread-status-test-${n}`;
    const alice = `unread-status-a-${n}`;
    const bob = `unread-status-b-${n}`;
    const ref = db.doc(`chats/${chatId}`);
    await ref.create({ version: 2, state: 'active', participants: [alice, bob] });
    const send = (uid, id, instant) =>
        sendPrivateMessageTransaction(db, uid, chatId, `text ${id}`, uuid(id), () => instant);
    return { chatId, alice, bob, ref, send };
}

test('authoritative count ignores stale preview and own messages', async () => {
    const x = await setup();
    const a = await x.send(x.alice, 100 + counter * 10, 10_000);
    await x.send(x.alice, 101 + counter * 10, 12_000);
    await x.send(x.bob, 102 + counter * 10, 10_000);
    const preview = db.doc(`users/${x.bob}/chats/${x.alice}`);
    await preview.update({ unread: 999 }); // Simulate stale cache/materialized counter.
    assert.deepEqual(await getPrivateChatUnreadCount(db, x.bob, x.chatId), {
        chatId: x.chatId, unread: 2
    });
    assert.equal((await getPrivateChatUnreadCount(db, x.alice, x.chatId)).unread, 1);
    await markPrivateMessageReadTransaction(db, x.bob, x.chatId, a.messageId);
    assert.equal((await getPrivateChatUnreadCount(db, x.bob, x.chatId)).unread, 1);
    assert.equal((await preview.get()).get('unread'), 998); // Read-only query did not rewrite it.
});

test('nonmember and blocked users cannot inspect unread metadata', async () => {
    const x = await setup();
    await assert.rejects(getPrivateChatUnreadCount(db, 'intruder', x.chatId), { code: 'permission-denied' });
    await assert.rejects(getPrivateChatUnreadCount(db, null, x.chatId), { code: 'unauthenticated' });
    await assert.rejects(getPrivateChatUnreadCount(db, x.bob, 'bad/id'), { code: 'invalid-argument' });
    await db.doc(`users/${x.bob}/blockedUsers/${x.alice}`).set({ blocked: true });
    await assert.rejects(getPrivateChatUnreadCount(db, x.bob, x.chatId), { code: 'permission-denied' });
});

test.after(async () => { await deleteApp(app); });
