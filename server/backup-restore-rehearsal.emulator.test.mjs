import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { rehearseBackupRestore } from './backup-restore-rehearsal.js';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Emulator required');
const projectId = 'demo-dreamandgo-chat-rules';
const app = initializeApp({ projectId }, 'restore-rehearsal-tests');
const db = getFirestore(app);
let counter = 0;
async function fixture() {
    const runId = `restore-${++counter}`;
    const root = db.collection('migrationRehearsals').doc(runId);
    await root.collection('sourceMessages').doc('m1').create({
        senderId: 'alice', text: 'Test original', createdAt: { seconds: 1 }, read: false
    });
    await root.collection('sourceMessages').doc('m2').create({
        senderId: 'bob', text: 'Reply', createdAt: { seconds: 2 }, read: true
    });
    return { runId, root };
}
const restore = runId => rehearseBackupRestore(db, { projectId, runId });

test('rebuilds test history exactly, repeat is idempotent', async () => {
    const { runId, root } = await fixture();
    const first = await restore(runId);
    assert.equal(first.status, 'restore_rehearsal_verified');
    assert.equal(first.durableBackupVerified, false);
    assert.equal(first.sourceDigest, first.restoredDigest);
    const second = await restore(runId);
    assert.equal(second.restoredDigest, first.restoredDigest);
    assert.equal((await root.collection('restoredMessages').get()).size, 2);
});

test('partial restored history is completed without overwrites', async () => {
    const { runId, root } = await fixture();
    const doc = (await root.collection('sourceMessages').doc('m1').get()).data();
    await root.collection('restoredMessages').doc('m1').create(doc);
    const result = await restore(runId);
    assert.equal(result.sourceCount, 2);
});

test('tampered restored document fails and remains unchanged', async () => {
    const { runId, root } = await fixture();
    await root.collection('restoredMessages').doc('m1').create({
        senderId: 'mallory', text: 'tampered', createdAt: { seconds: 1 }
    });
    await assert.rejects(restore(runId), /conflicts/);
    assert.equal((await root.collection('restoredMessages').doc('m1').get()).get('text'), 'tampered');
});

test('does not run against a non-demo project', async () => {
    const { runId } = await fixture();
    await assert.rejects(rehearseBackupRestore(db, { projectId: 'real-project', runId }), /isolated/);
});

test.after(async () => { await deleteApp(app); });
