import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sendPrivateMessageTransaction } from './chat-transactions.js';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Must run against Firestore emulator only');
const app = initializeApp({ projectId: 'demo-dreamandgo-chat-rules' }, 'chat-transaction-tests');
const db = getFirestore(app);

const key = n => `550e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`;
let caseNumber = 0;
async function makeChat() {
    const chatId = `tx-test-${++caseNumber}`;
    await db.doc(`chats/${chatId}`).set({
        participants: ['alice', 'bob'], state: 'active', version: 2
    });
    return chatId;
}
const send = (chatId, text, id, uid = 'alice') =>
    sendPrivateMessageTransaction(db, uid, chatId, text, key(id));

test('simultaneous retries create one message and increment unread once', async () => {
    const chatId = await makeChat();
    const results = await Promise.all([send(chatId, 'Привет', 1), send(chatId, 'Привет', 1), send(chatId, 'Привет', 1)]);
    assert.equal(new Set(results.map(r => r.messageId)).size, 1);
    const messages = await db.collection(`chats/${chatId}/messages`).get();
    assert.equal(messages.size, 1);
    const recipient = await db.doc('users/bob/chats/alice').get();
    assert.equal(recipient.get('unread'), 1);
    const cooldownBefore = await db.doc('users/alice/privateChatLimits/send').get();
    await send(chatId, 'Привет', 1);
    const cooldownAfter = await db.doc('users/alice/privateChatLimits/send').get();
    assert.deepEqual(cooldownAfter.get('lastSentAt'), cooldownBefore.get('lastSentAt'));
    const afterRetry = await db.doc('users/bob/chats/alice').get();
    assert.equal(afterRetry.get('unread'), 1);
    await assert.rejects(send(chatId, 'Другой текст', 1), { code: 'functions/already-exists' });
});

test('different messages sent simultaneously share the sender cooldown', async () => {
    // Different user avoids the cooldown from the first test.
    const chatId = await makeChat();
    await db.doc(`chats/${chatId}`).update({ participants: ['bob', 'charlie'] });
    const attempts = await Promise.allSettled([
        send(chatId, 'Один', 2, 'charlie'),
        send(chatId, 'Два', 3, 'charlie')
    ]);
    assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter(x => x.status === 'rejected').length, 1);
    assert.equal(attempts.find(x => x.status === 'rejected').reason.code, 'functions/resource-exhausted');
    const messages = await db.collection(`chats/${chatId}/messages`).get();
    assert.equal(messages.size, 1);
});

test('blocking and nonmember checks stop new writes', async () => {
    const chatId = await makeChat();
    await db.doc('users/bob/blockedUsers/alice').set({ createdBy: 'bob' });
    await assert.rejects(send(chatId, 'Нельзя', 4), { code: 'functions/permission-denied' });
    await db.doc('users/bob/blockedUsers/alice').delete();
    await assert.rejects(send(chatId, 'Я не участник', 5, 'mallory'), { code: 'functions/permission-denied' });
    const messages = await db.collection(`chats/${chatId}/messages`).get();
    assert.equal(messages.size, 0);
});

test.after(async () => { await deleteApp(app); });
