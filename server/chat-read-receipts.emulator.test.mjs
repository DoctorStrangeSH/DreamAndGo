import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sendPrivateMessageTransaction } from './chat-transactions.js';
import { markPrivateMessageReadTransaction } from './chat-read-receipts.js';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Emulator required');
const app = initializeApp({ projectId: 'demo-dreamandgo-chat-rules' }, 'read-receipt-tests');
const db = getFirestore(app);
const uuid = n => `950e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`;
let counter = 0;
async function setup() {
    const n = ++counter;
    const chatId = `receipt-test-${n}`;
    const alice = `receipt-a-${n}`, bob = `receipt-b-${n}`;
    const ref = db.doc(`chats/${chatId}`);
    await ref.create({ version: 2, state: 'active', participants: [alice, bob] });
    const sent = await sendPrivateMessageTransaction(db, alice, chatId, 'private', uuid(n), () => 100000 + n * 2000);
    return { chatId, alice, bob, ref, messageId: sent.messageId };
}
test('only recipient can mark incoming v2 message read, repeated call preserves timestamp', async () => {
    const x = await setup();
    const messageRef = x.ref.collection('messages').doc(x.messageId);
    assert.equal((await messageRef.get()).get('read'), false);
    const ack = await markPrivateMessageReadTransaction(db, x.bob, x.chatId, x.messageId);
    assert.deepEqual(ack, { status: 'read', messageId: x.messageId });
    const first = await messageRef.get();
    assert.equal(first.get('read'), true);
    assert.ok(first.get('readAt'));
    assert.deepEqual(await markPrivateMessageReadTransaction(db, x.bob, x.chatId, x.messageId), ack);
    const second = await messageRef.get();
    assert.ok(first.get('readAt').isEqual(second.get('readAt')));
});
test('sender, outsider and unauthenticated user cannot forge read receipt', async () => {
    const x = await setup();
    await assert.rejects(markPrivateMessageReadTransaction(db, x.alice, x.chatId, x.messageId), { code: 'permission-denied' });
    await assert.rejects(markPrivateMessageReadTransaction(db, 'stranger', x.chatId, x.messageId), { code: 'permission-denied' });
    await assert.rejects(markPrivateMessageReadTransaction(db, null, x.chatId, x.messageId), { code: 'unauthenticated' });
    assert.equal((await x.ref.collection('messages').doc(x.messageId).get()).get('read'), false);
});
test('rejects nonexistent, invalid and corrupted message references', async () => {
    const x = await setup();
    await assert.rejects(markPrivateMessageReadTransaction(db, x.bob, x.chatId, 'invalid'), { code: 'invalid-argument' });
    await assert.rejects(markPrivateMessageReadTransaction(db, x.bob, x.chatId, 'a'.repeat(64)), { code: 'not-found' });
    await x.ref.collection('messages').doc(x.messageId).update({ clientMessageId: uuid(777) });
    await assert.rejects(markPrivateMessageReadTransaction(db, x.bob, x.chatId, x.messageId), { code: 'permission-denied' });
});
test('blocks and frozen state prevent new read receipts', async () => {
    const x = await setup();
    await db.doc(`users/${x.bob}/blockedUsers/${x.alice}`).set({ blocked: true });
    await assert.rejects(markPrivateMessageReadTransaction(db, x.bob, x.chatId, x.messageId), { code: 'permission-denied' });
    await db.doc(`users/${x.bob}/blockedUsers/${x.alice}`).delete();
    await x.ref.update({ state: 'frozen' });
    await assert.rejects(markPrivateMessageReadTransaction(db, x.bob, x.chatId, x.messageId), { code: 'failed-precondition' });
    assert.equal((await x.ref.collection('messages').doc(x.messageId).get()).get('read'), false);
});
test.after(async () => { await deleteApp(app); });
