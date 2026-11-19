import test from 'node:test';
import assert from 'node:assert/strict';
import { assessChatCutoverReadiness } from '../server/cutover-readiness.js';
const fp = 'a'.repeat(64);
const plan = {
    kind: 'dreamandgo-chat-migration-dry-run-v1', executable: false,
    inputFingerprint: fp, candidates: [{ sourceChatId: 'a' }], held: []
};
const now = '2026-11-14T12:00:00.000Z';
const names = [
    'production_rules_review', 'independent_backup', 'restore_drill',
    'full_message_integrity', 'legacy_write_freeze',
    'rollback_drill', 'operator_approval'
];
const attestation = kind => ({
    kind, planFingerprint: fp, scope: 'production',
    reviewed: true, reference: 'review-record-1',
    observedAt: '2026-11-14T10:00:00.000Z',
    expiresAt: '2026-11-15T10:00:00.000Z'
});
const evidence = () => Object.fromEntries(names.map(name => [name, attestation(name)]));
const assess = (overrides = {}) =>
    assessChatCutoverReadiness({ plan, evidence: evidence(), now, ...overrides });

test('all review records still do not enable cutover', () => {
    const result = assess();
    assert.equal(result.reviewReady, true);
    assert.equal(result.productionSwitchEnabled, false);
    assert.equal(result.executable, false);
    assert.equal(result.reviewedControls.length, names.length);
});
test('emulator-only evidence does not count as production', () => {
    const records = evidence();
    records.restore_drill.scope = 'emulator';
    const result = assess({ evidence: records });
    assert.equal(result.reviewReady, false);
    assert.ok(result.issues.includes('missing_or_invalid_restore_drill'));
});
test('stale, future, wrong fingerprint and unchecked attestations are rejected', () => {
    for (const changes of [
        { expiresAt: '2026-11-14T11:59:59.000Z' },
        { observedAt: '2026-11-14T12:01:00.000Z' },
        { planFingerprint: 'b'.repeat(64) },
        { reviewed: false },
        { reference: '' }
    ]) {
        const records = evidence();
        Object.assign(records.independent_backup, changes);
        assert.equal(assess({ evidence: records }).reviewReady, false);
    }
});
test('held chats block review even with all controls', () => {
    assert.ok(assess({ plan: { ...plan, held: [{ sourceChatId: 'x' }] } }).issues.includes('ambiguous_conversations'));
});
test('empty plan, missing controls or executable plan cannot pass', () => {
    assert.equal(assess({ evidence: {} }).reviewReady, false);
    assert.equal(assess({ plan: { ...plan, candidates: [] } }).reviewReady, false);
    assert.throws(() => assess({ plan: { ...plan, executable: true } }));
});
