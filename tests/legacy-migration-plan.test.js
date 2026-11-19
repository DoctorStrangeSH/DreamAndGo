import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLegacyChatMigrationPlan } from '../server/legacy-migration-plan.js';
import { conversationPairKey } from '../server/chat-pair.js';

const confirmed = {
    chatIndexes: [
        { ownerUid: 'alice', partnerUid: 'bob' },
        { ownerUid: 'bob', partnerUid: 'alice' }
    ],
    legacyChats: [{ id: 'alice_bob', messageCount: 2, senderIds: ['alice', 'bob'] }]
};

test('dry run emits stable pair mapping but never assigns chat IDs or runs writes', () => {
    const plan = buildLegacyChatMigrationPlan(confirmed);
    assert.equal(plan.executable, false);
    assert.equal(plan.candidates.length, 1);
    assert.equal(plan.held.length, 0);
    assert.equal(plan.candidates[0].targetPairKey, conversationPairKey('alice', 'bob'));
    assert.equal(plan.candidates[0].targetChatId, null);
    assert.equal(plan.candidates[0].sourceMessageCount, 2);
    assert.match(plan.inputFingerprint, /^[a-f0-9]{64}$/);
    assert.ok(plan.globalBlockers.includes('external_backup_and_restore_not_verified'));
    assert.deepEqual(buildLegacyChatMigrationPlan(confirmed), plan);
});

test('missing message inventory stays on hold even when both indexes match', () => {
    const plan = buildLegacyChatMigrationPlan({
        chatIndexes: confirmed.chatIndexes,
        legacyChats: [{ id: 'alice_bob' }]
    });
    assert.equal(plan.candidates.length, 0);
    assert.ok(plan.held[0].reasons.includes('message_count_not_verified'));
    assert.ok(plan.held[0].reasons.includes('sender_list_not_verified'));
});

test('ambiguous legacy IDs can never be automatically mapped', () => {
    const plan = buildLegacyChatMigrationPlan({
        chatIndexes: [
            { ownerUid: 'a_b', partnerUid: 'c' },
            { ownerUid: 'c', partnerUid: 'a_b' },
            { ownerUid: 'a', partnerUid: 'b_c' },
            { ownerUid: 'b_c', partnerUid: 'a' }
        ],
        legacyChats: [{ id: 'a_b_c', messageCount: 1, senderIds: ['a'] }]
    });
    assert.equal(plan.candidates.length, 0);
    assert.equal(plan.held.length, 2);
    assert.ok(plan.globalBlockers.includes('unverified_or_ambiguous_conversations'));
});

test('unexpected sender prevents mapping even with known count', () => {
    const plan = buildLegacyChatMigrationPlan({
        chatIndexes: confirmed.chatIndexes,
        legacyChats: [{ id: 'alice_bob', messageCount: 1, senderIds: ['mallory'] }]
    });
    assert.equal(plan.candidates.length, 0);
    assert.equal(plan.held.length, 1);
    assert.ok(plan.held[0].reasons.includes('unexpected_message_sender'));
});

test('input fingerprint changes when source inventory changes', () => {
    const changed = {
        chatIndexes: confirmed.chatIndexes,
        legacyChats: [{ id: 'alice_bob', messageCount: 3, senderIds: ['alice', 'bob'] }]
    };
    assert.notEqual(buildLegacyChatMigrationPlan(changed).inputFingerprint,
        buildLegacyChatMigrationPlan(confirmed).inputFingerprint);
});

test('the planner never mutates exported metadata', () => {
    const before = JSON.stringify(confirmed);
    buildLegacyChatMigrationPlan(confirmed);
    assert.equal(JSON.stringify(confirmed), before);
});
