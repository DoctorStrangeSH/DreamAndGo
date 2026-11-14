import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getPrivateMessageStatus } from './message-status.js';
import { sendPrivateMessageTransaction } from './chat-transactions.js';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Emulator required');
const app = initializeApp({ projectId: 'demo-dreamandgo-chat-rules' }, 'message-status-tests');
const db = getFirestore(app);
const uuid = '550e8400-e29b-41d4-a716-446655440000';
let seq = 0;
async function setup() {
    const n = ++seq;
    const chatId = `status-test-${n}`;
    const alice = `status-a-${n}`;
    const bob = `status-b-${n}`;
    const ref = db.doc(`chats/${chatId}`);
    await ref.create({ version: 2, state: 'active', participants: [alice, bob] });
    return { chatId, alice, bob, ref };
}
test('sender can distinguish missing from committed without leaking text', async () => {
    const x = await setup();
    assert.deepEqual(await getPrivateMessageStatus(db, x.alice, x.chatId, uuid), { status: 'missing' });
    const result = await sendPrivateMessageTransaction(db, x.alice, x.chatId, 'private text', uuid, () => 120000);
    assert.deepEqual(await getPrivateMessageStatus(db, x.alice, x.chatId, uuid), { status: 'sent', messageId: result.messageId });
    await x.ref.update({ state: 'frozen' });
    assert.equal((await getPrivateMessageStatus(db, x.alice, x.chatId, uuid)).status, 'sent');
});
test('outsider and unauthenticated callers cannot query message existence', async () => {
    const x = await setup();
    await assert.rejects(getPrivateMessageStatus(db, 'stranger', x.chatId, uuid), { code: 'permission-denied' });
    await assert.rejects(getPrivateMessageStatus(db, null, x.chatId, uuid), { code: 'unauthenticated' });
    await assert.rejects(getPrivateMessageStatus(db, x.alice, x.chatId, 'bad'), { code: 'invalid-argument' });
});
test('either direction of blocking prevents status enumeration', async () => {
    const x = await setup();
    await db.doc(`users/${x.bob}/blockedUsers/${x.alice}`).set({ blocked: true });
    await assert.rejects(getPrivateMessageStatus(db, x.alice, x.chatId, uuid), { code: 'permission-denied' });
    await db.doc(`users/${x.bob}/blockedUsers/${x.alice}`).delete();
    await db.doc(`users/${x.alice}/blockedUsers/${x.bob}`).set({ blocked: true });
    await assert.rejects(getPrivateMessageStatus(db, x.alice, x.chatId, uuid), { code: 'permission-denied' });
});
test.after(async () => { await deleteApp(app); });
