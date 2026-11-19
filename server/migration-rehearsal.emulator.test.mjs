import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { rehearseChatCopy } from './migration-rehearsal.js';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Must run against Firestore emulator only');
const projectId = 'demo-dreamandgo-chat-rules';
const app = initializeApp({ projectId }, 'migration-rehearsal-test');
const db = getFirestore(app);
let counter = 0;
const run = async (runId, options = {}) => rehearseChatCopy(db, { projectId, runId, ...options });
async function fixture() {
    const runId = `rehearsal-${++counter}`;
    const root = db.collection('migrationRehearsals').doc(runId);
    const source = root.collection('sourceMessages');
    await source.doc('m1').create({ senderId: 'alice', text: 'Привет', createdAt: { seconds: 1 } });
    await source.doc('m2').create({ senderId: 'bob', text: 'Ответ', createdAt: { seconds: 2 } });
    return { runId, root, source };
}

test('interrupted rehearsal resumes without duplicates and preserves data', async () => {
    const { runId, root } = await fixture();
    const paused = await run(runId, { stopAfter: 1 });
    assert.equal(paused.status, 'paused');
    assert.equal(paused.copiedCount, 1);
    const resumed = await run(runId);
    assert.equal(resumed.status, 'rehearsal_verified');
    assert.equal(resumed.copiedCount, 2);
    assert.equal(resumed.addedThisRun, 1);
    assert.equal(resumed.sourceDigest, resumed.targetDigest);
    const again = await run(runId);
    assert.equal(again.addedThisRun, 0);
    assert.equal((await root.collection('targetMessages').get()).size, 2);
});

test('changed target rejects resume and never overwrites', async () => {
    const { runId, root } = await fixture();
    await run(runId, { stopAfter: 1 });
    const target = root.collection('targetMessages').doc('m1');
    await target.update({ text: 'tampered' });
    await assert.rejects(run(runId), /differs/);
    assert.equal((await target.get()).get('text'), 'tampered');
});

test('unexpected target message blocks any copy', async () => {
    const { runId, root } = await fixture();
    await root.collection('targetMessages').doc('unknown').create({
        senderId: 'mallory', text: 'injected', createdAt: { seconds: 3 }
    });
    await assert.rejects(run(runId), /Unexpected target/);
    assert.equal((await root.collection('targetMessages').get()).size, 1);
});

test('production safeguards reject missing emulator or wrong project', async () => {
    const { runId } = await fixture();
    await assert.rejects(rehearseChatCopy(db, { projectId: 'production', runId }), /isolated/);
    await assert.rejects(run('../escape'), /isolated/);
});

test.after(async () => { await deleteApp(app); });
