import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { rehearseChatReopen } from './chat-rollback-rehearsal.js';
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
const projectId = 'demo-dreamandgo-chat-rules';
const app = initializeApp({ projectId }, 'chat-rollback-tests');
const db = getFirestore(app);
let n = 0;
const data = { senderId: 'alice', text: 'original', createdAt: { seconds: 1 }, read: false };
async function fixture() {
    const chatId = `rollback-drill-${++n}`;
    const ref = db.doc(`chats/${chatId}`);
    await ref.create({ participants: ['alice', 'bob'], version: 2, state: 'frozen' });
    await ref.collection('messages').doc('m1').create(data);
    return { chatId, ref, expectedMessages: [{ id: 'm1', data }] };
}
const reopen = fixture => rehearseChatReopen(db, { projectId, ...fixture });

test('matching history permits one rehearsal reopen', async () => {
    const fixtureData = await fixture();
    const result = await reopen(fixtureData);
    assert.equal(result.status, 'emulator_chat_reopened');
    assert.equal(result.productionSwitchEnabled, false);
    assert.equal((await fixtureData.ref.get()).get('state'), 'active');
    await assert.rejects(reopen(fixtureData), /frozen/);
});
test('changed message blocks reopen and keeps channel frozen', async () => {
    const entry = await fixture();
    await entry.ref.collection('messages').doc('m1').update({ text: 'changed' });
    await assert.rejects(reopen(entry), /integrity/);
    assert.equal((await entry.ref.get()).get('state'), 'frozen');
});
test('missing message blocks reopen', async () => {
    const entry = await fixture();
    await entry.ref.collection('messages').doc('m1').delete();
    await assert.rejects(reopen(entry), /integrity/);
    assert.equal((await entry.ref.get()).get('state'), 'frozen');
});
test('extra message blocks reopening without deleting anything', async () => {
    const entry = await fixture();
    await entry.ref.collection('messages').doc('extra').create({
        senderId: 'bob', text: 'unexpected', createdAt: { seconds: 2 }
    });
    await assert.rejects(reopen(entry), /integrity/);
    assert.equal((await entry.ref.get()).get('state'), 'frozen');
    assert.equal((await entry.ref.collection('messages').get()).size, 2);
});

test('concurrent recovery requests allow exactly one state transition', async () => {
    const entry = await fixture();
    const results = await Promise.allSettled([reopen(entry), reopen(entry)]);
    assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
    assert.equal(results.filter(row => row.status === 'rejected').length, 1);
    assert.match(results.find(row => row.status === 'rejected').reason.message, /frozen/);
    assert.equal((await entry.ref.get()).get('state'), 'active');
    assert.equal((await entry.ref.collection('messages').get()).size, 1);
});

test('rejects non-demo project and untrusted chat IDs', async () => {
    const entry = await fixture();
    await assert.rejects(rehearseChatReopen(db, { projectId: 'prod', ...entry }), /isolated/);
    await assert.rejects(rehearseChatReopen(db, { projectId, chatId: 'real-chat', expectedMessages: [] }), /isolated/);
});
test.after(async () => { await deleteApp(app); });
