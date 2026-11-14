import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sendPrivateMessageTransaction } from './chat-transactions.js';
import { rehearseChatReopen } from './chat-rollback-rehearsal.js';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Emulator required');
const projectId = 'demo-dreamandgo-chat-rules';
const app = initializeApp({ projectId }, 'chat-cutover-journey-tests');
const db = getFirestore(app);
const sendId = n => `750e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`;
let counter = 0;
async function setup() {
    const number = ++counter;
    const chatId = `rollback-drill-journey-${number}`;
    const alice = `journey-a-${number}`;
    const bob = `journey-b-${number}`;
    const ref = db.doc(`chats/${chatId}`);
    await ref.create({ version: 2, state: 'active', participants: [alice, bob] });
    return { chatId, alice, bob, ref };
}
async function send(entry, n, nowMs, text = 'Привет') {
    return sendPrivateMessageTransaction(db, entry.alice, entry.chatId, text, sendId(n), () => nowMs);
}
async function inventory(entry) {
    const snapshot = await entry.ref.collection('messages').get();
    return snapshot.docs.map(doc => ({ id: doc.id, data: JSON.parse(JSON.stringify(doc.data())) }));
}

test('full freeze/acknowledge/verify/reopen/send journey does not duplicate messages', async () => {
    const entry = await setup();
    const saved = await send(entry, 1, 100000);
    await entry.ref.update({ state: 'frozen' });
    assert.deepEqual(await send(entry, 1, 100000), saved);
    await assert.rejects(send(entry, 2, 102000, 'blocked while frozen'), { code: 'failed-precondition' });
    const expectedMessages = await inventory(entry);
    assert.equal(expectedMessages.length, 1);
    const reopened = await rehearseChatReopen(db, {
        projectId, chatId: entry.chatId, expectedMessages
    });
    assert.equal(reopened.status, 'emulator_chat_reopened');
    await send(entry, 2, 102000, 'after reopen');
    assert.equal((await inventory(entry)).length, 2);
    const recipient = await db.doc(`users/${entry.bob}/chats/${entry.alice}`).get();
    assert.equal(recipient.get('unread'), 2);
});
test('tampering keeps chat frozen and prevents later sends', async () => {
    const entry = await setup();
    await send(entry, 3, 110000);
    await entry.ref.update({ state: 'frozen' });
    const expectedMessages = await inventory(entry);
    await entry.ref.collection('messages').doc(expectedMessages[0].id).update({ text: 'tampered' });
    await assert.rejects(rehearseChatReopen(db, {
        projectId, chatId: entry.chatId, expectedMessages
    }), /integrity/);
    assert.equal((await entry.ref.get()).get('state'), 'frozen');
    await assert.rejects(send(entry, 4, 112000), { code: 'failed-precondition' });
});
test.after(async () => { await deleteApp(app); });
