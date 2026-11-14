import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createMigrationJournal, recordCopyCheckpoint, verifyCopyCheckpoint
} from '../server/migration-journal.js';

const fingerprint = 'a'.repeat(64);
const candidate = {
    sourceChatId: 'old-chat', sourceMessageCount: 2, targetPairKey: 'pair-hash',
    targetChatId: null
};
const plan = {
    kind: 'dreamandgo-chat-migration-dry-run-v1', inputFingerprint: fingerprint,
    executable: false, candidates: [candidate], held: []
};
const source = [
    { id: '1', data: { senderId: 'alice', text: 'hello', createdAt: { seconds: 1 } } },
    { id: '2', data: { senderId: 'bob', text: 'hi', createdAt: { seconds: 2 } } }
];

test('checkpoint progression is monotonic and remains non-executable', () => {
    const initial = createMigrationJournal(plan, 'old-chat');
    const one = recordCopyCheckpoint(initial, { plan, sourceChatId: 'old-chat', copiedCount: 1 });
    assert.equal(one.copiedCount, 1);
    assert.equal(initial.copiedCount, 0);
    assert.throws(() => recordCopyCheckpoint(one, { plan, sourceChatId: 'old-chat', copiedCount: 0 }));
    assert.throws(() => recordCopyCheckpoint(one, { plan, sourceChatId: 'old-chat', copiedCount: 3 }));
    const full = recordCopyCheckpoint(one, { plan, sourceChatId: 'old-chat', copiedCount: 2 });
    assert.throws(() => verifyCopyCheckpoint(one, source, source, plan));
    const verified = verifyCopyCheckpoint(full, source, [...source].reverse(), plan);
    assert.equal(verified.status, 'rehearsal_verified');
    assert.equal(verified.executable, false);
    assert.equal(verified.sourceDigest, verified.targetDigest);
    assert.throws(() => recordCopyCheckpoint(verified, { plan, sourceChatId: 'old-chat', copiedCount: 2 }));
});

test('changed snapshot or candidate prevents resume', () => {
    const pending = createMigrationJournal(plan, 'old-chat');
    const changedPlan = { ...plan, inputFingerprint: 'b'.repeat(64) };
    const changedCandidate = { ...plan, candidates: [{ ...candidate, sourceMessageCount: 3 }] };
    assert.throws(() => recordCopyCheckpoint(pending, { plan: changedPlan, sourceChatId: 'old-chat', copiedCount: 1 }));
    assert.throws(() => recordCopyCheckpoint(pending, { plan: changedCandidate, sourceChatId: 'old-chat', copiedCount: 1 }));
    assert.throws(() => createMigrationJournal({ ...plan, executable: true }, 'old-chat'));
    assert.throws(() => createMigrationJournal({ ...plan, held: [{ sourceChatId: 'old-chat' }] }, 'old-chat'));
});

test('missing or edited message cannot be verified', () => {
    const full = recordCopyCheckpoint(createMigrationJournal(plan, 'old-chat'), {
        plan, sourceChatId: 'old-chat', copiedCount: 2
    });
    assert.throws(() => verifyCopyCheckpoint(full, source, source.slice(0, 1), plan));
    const edited = [{ ...source[0], data: { ...source[0].data, text: 'edited' } }, source[1]];
    assert.throws(() => verifyCopyCheckpoint(full, source, edited, plan));
    assert.throws(() => verifyCopyCheckpoint(full, source.slice(0, 1), source.slice(0, 1), plan));
});

test('empty source can be verified only after explicit checkpoint', () => {
    const emptyPlan = { ...plan, candidates: [{ ...candidate, sourceMessageCount: 0 }] };
    const initial = createMigrationJournal(emptyPlan, 'old-chat');
    assert.throws(() => verifyCopyCheckpoint(initial, [], [], emptyPlan));
    const full = recordCopyCheckpoint(initial, { plan: emptyPlan, sourceChatId: 'old-chat', copiedCount: 0 });
    assert.equal(verifyCopyCheckpoint(full, [], [], emptyPlan).status, 'rehearsal_verified');
});
