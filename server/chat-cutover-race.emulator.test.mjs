import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sendPrivateMessageTransaction } from './chat-transactions.js';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore Emulator required');
const app = initializeApp({ projectId: 'demo-dreamandgo-chat-rules' }, 'cutover-race-tests');
const db = getFirestore(app);
const id = n => `650e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`;
let next = 0;
async function chat() {
    const n = ++next;
    const chatId = `freeze-test-${n}`;
    const sender = `sender-${n}`;
    const recipient = `recipient-${n}`;
    const chatRef = db.doc(`chats/${chatId}`);
    await chatRef.create({ participants: [sender, recipient], state: 'active', version: 2 });
    return { chatId, sender, recipient, chatRef };
}
const send = (entry, messageId, text = 'Hello') =>
    sendPrivateMessageTransaction(db, entry.sender, entry.chatId, text, id(messageId), () => 100000);

test('freeze acknowledges old retry but rejects fresh message without unread growth', async () => {
    const entry = await chat();
    const first = await send(entry, 1);
    const before = await db.doc(`users/${entry.recipient}/chats/${entry.sender}`).get();
    assert.equal(before.get('unread'), 1);
    await entry.chatRef.update({ state: 'frozen' });
    assert.deepEqual(await send(entry, 1), first);
    await assert.rejects(send(entry, 2, 'new after freeze'), { code: 'failed-precondition' });
    await assert.rejects(send(entry, 1, 'changed retry'), { code: 'already-exists' });
    const messages = await entry.chatRef.collection('messages').get();
    assert.equal(messages.size, 1);
    const after = await db.doc(`users/${entry.recipient}/chats/${entry.sender}`).get();
    assert.equal(after.get('unread'), 1);
});

test('simultaneous freeze and send has no silent message loss', async () => {
    const entry = await chat();
    const [sendResult] = await Promise.allSettled([
        send(entry, 3),
        entry.chatRef.update({ state: 'frozen' })
    ]);
    const messages = await entry.chatRef.collection('messages').get();
    const unread = await db.doc(`users/${entry.recipient}/chats/${entry.sender}`).get();
    assert.equal(messages.size, sendResult.status === 'fulfilled' ? 1 : 0);
    assert.equal(unread.exists ? unread.get('unread') : 0, messages.size);
    if (sendResult.status === 'rejected') {
        assert.equal(sendResult.reason.code, 'failed-precondition');
    } else {
        assert.deepEqual(await send(entry, 3), sendResult.value);
    }
    await assert.rejects(send(entry, 4, 'late message'), { code: 'failed-precondition' });
});

test('blocked sender cannot probe frozen message retry', async () => {
    const entry = await chat();
    await send(entry, 5);
    await entry.chatRef.update({ state: 'frozen' });
    await db.doc(`users/${entry.recipient}/blockedUsers/${entry.sender}`).create({ blocked: true });
    await assert.rejects(send(entry, 5), { code: 'permission-denied' });
});

test.after(async () => { await deleteApp(app); });
