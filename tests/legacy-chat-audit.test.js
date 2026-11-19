import test from 'node:test';
import assert from 'node:assert/strict';
import { auditLegacyChatSnapshot, legacyChatId } from '../js/core/legacy-chat-audit.js';

const pairViews = (a, b) => [
    { ownerUid: a, partnerUid: b },
    { ownerUid: b, partnerUid: a }
];

test('only two reciprocal indexes and an existing chat confirm legacy ownership', () => {
    const report = auditLegacyChatSnapshot({
        chatIndexes: pairViews('alice', 'bob'),
        legacyChats: [{ id: 'alice_bob', messageCount: 2, senderIds: ['alice', 'bob'] }]
    });
    assert.equal(report.summary.safePairCount, 1);
    assert.deepEqual(report.safePairs[0].members, ['alice', 'bob']);
    assert.equal(report.summary.reviewPairCount, 0);
    assert.equal(report.summary.issueCount, 0);
});

test('one-sided index never proves ownership', () => {
    const report = auditLegacyChatSnapshot({
        chatIndexes: [{ ownerUid: 'alice', partnerUid: 'bob' }],
        legacyChats: [{ id: 'alice_bob', messageCount: 1 }]
    });
    assert.equal(report.safePairs.length, 0);
    assert.ok(report.needsReview[0].reasons.includes('missing_reciprocal_index'));
});

test('underscore-joined UID collision quarantines both plausible conversations', () => {
    assert.equal(legacyChatId('a_b', 'c'), legacyChatId('a', 'b_c'));
    const report = auditLegacyChatSnapshot({
        chatIndexes: [...pairViews('a_b', 'c'), ...pairViews('a', 'b_c')],
        legacyChats: [{ id: 'a_b_c', messageCount: 4 }]
    });
    assert.equal(report.safePairs.length, 0);
    assert.equal(report.needsReview.length, 2);
    assert.ok(report.needsReview.every(x => x.reasons.includes('ambiguous_legacy_chat_id')));
});

test('orphan chat and unexpected sender must be reviewed', () => {
    const report = auditLegacyChatSnapshot({
        chatIndexes: pairViews('alice', 'bob'),
        legacyChats: [
            { id: 'alice_bob', senderIds: ['alice', 'mallory'] },
            { id: 'orphan', messageCount: 2 }
        ]
    });
    assert.ok(report.needsReview[0].reasons.includes('unexpected_message_sender'));
    assert.deepEqual(report.unreferencedChatIds, ['orphan']);
    assert.ok(report.issues.some(x => x.code === 'unreferenced_legacy_chat'));
});

test('invalid data and duplicated records cannot be silently marked safe', () => {
    const report = auditLegacyChatSnapshot({
        chatIndexes: [...pairViews('alice', 'bob'), { ownerUid: 'alice', partnerUid: 'bob' },
            { ownerUid: 'bad/user', partnerUid: 'bob' }],
        legacyChats: [{ id: 'alice_bob', messageCount: -1 },
            { id: 'alice_bob', messageCount: 3 }]
    });
    assert.equal(report.safePairs.length, 0);
    assert.ok(report.needsReview[0].reasons.includes('invalid_legacy_chat_metadata'));
    assert.ok(report.needsReview[0].reasons.includes('duplicate_index_view'));
    assert.ok(report.issues.some(x => x.code === 'invalid_index'));
});

test('missing source chat and mismatched declared id are explicit blockers', () => {
    const report = auditLegacyChatSnapshot({
        chatIndexes: [
            { ownerUid: 'alice', partnerUid: 'bob', chatId: 'wrong' },
            { ownerUid: 'bob', partnerUid: 'alice' }
        ],
        legacyChats: []
    });
    assert.equal(report.safePairs.length, 0);
    assert.ok(report.issues.some(x => x.code === 'index_chat_id_mismatch'));
    assert.ok(report.needsReview[0].reasons.includes('missing_reciprocal_index'));
    assert.ok(report.needsReview[0].reasons.includes('missing_legacy_chat_document'));
});

test('requires complete metadata collections', () => {
    assert.throws(() => auditLegacyChatSnapshot(null), TypeError);
    assert.throws(() => auditLegacyChatSnapshot({ chatIndexes: [] }), TypeError);
});
