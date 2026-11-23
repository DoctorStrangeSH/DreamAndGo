import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildLegacyChatInventory,
    canonicalChatId,
    legacyChatId
} from './chat-migration-inventory.js';

const stamp = { toMillis: () => 1700000000000 };

function summary(ownerUid, partnerUid, extra = {}) {
    return {
        path: `users/${ownerUid}/chats/${partnerUid}`,
        id: partnerUid,
        data: {
            partnerId: partnerUid,
            lastMessage: 'private preview must not appear in report',
            lastMessageTime: stamp,
            unread: 2,
            createdAt: stamp,
            ...extra
        }
    };
}

function message(id, senderId = 'alice', extra = {}) {
    return {
        id,
        data: {
            senderId,
            text: 'private message body must never appear in inventory output',
            createdAt: stamp,
            read: false,
            edited: false,
            ...extra
        }
    };
}

test('canonical V2 ID is order-independent and legacy ID retains the old client convention', () => {
    assert.equal(canonicalChatId('alice', 'bob'), canonicalChatId('bob', 'alice'));
    assert.equal(legacyChatId('alice', 'bob'), 'alice_bob');
    assert.notEqual(canonicalChatId('a_b', 'c'), canonicalChatId('a', 'b_c'));
});

test('inventory accepts reciprocal summaries and valid legacy messages without exposing plaintext', () => {
    const inventory = buildLegacyChatInventory({
        summaries: [summary('alice', 'bob'), summary('bob', 'alice')],
        messagesByChat: {
            alice_bob: [message('message-1'), message('message-2', 'bob', { read: true })]
        }
    });

    assert.equal(inventory.manifest.totals.candidatePairs, 1);
    assert.equal(inventory.manifest.totals.reciprocalPairs, 1);
    assert.equal(inventory.manifest.totals.messageDocuments, 2);
    assert.equal(inventory.manifest.totals.pairsWithIssues, 0);
    assert.deepEqual(inventory.manifest.pairs[0].participants, ['alice', 'bob']);
    assert.equal(inventory.manifest.pairs[0].canonicalChatId, canonicalChatId('alice', 'bob'));
    assert.equal(inventory.manifest.pairs[0].messages[0].sourceSha256.length, 64);
    assert.equal(JSON.stringify(inventory).includes('private message body'), false);
    assert.equal(JSON.stringify(inventory).includes('private preview'), false);
});

test('missing reciprocal summary is a blocking pair issue', () => {
    const inventory = buildLegacyChatInventory({
        summaries: [summary('alice', 'bob')],
        messagesByChat: { alice_bob: [message('message-1')] }
    });

    assert.equal(inventory.manifest.totals.reciprocalPairs, 0);
    assert.ok(inventory.manifest.pairs[0].issues.includes('missing-reciprocal-summary'));
});

test('malformed message fields and unknown sender are reported without leaking content', () => {
    const inventory = buildLegacyChatInventory({
        summaries: [summary('alice', 'bob'), summary('bob', 'alice')],
        messagesByChat: {
            alice_bob: [message('..', 'mallory', {
                text: 42,
                createdAt: null,
                read: 'no',
                edited: 1
            })]
        }
    });

    const codes = inventory.manifest.pairs[0].issues;
    for (const expected of [
        'invalid-message-id',
        'unknown-sender',
        'invalid-message-text',
        'invalid-created-at',
        'invalid-read-flag',
        'invalid-edited-flag'
    ]) assert.ok(codes.includes(expected), `missing issue: ${expected}`);
});

test('legacy chat ID collisions are detected for distinct UID pairs containing underscores', () => {
    const summaries = [
        summary('a_b', 'c'), summary('c', 'a_b'),
        summary('a', 'b_c'), summary('b_c', 'a')
    ];
    const inventory = buildLegacyChatInventory({
        summaries,
        messagesByChat: { a_b_c: [message('message-1', 'a_b')] }
    });

    assert.equal(inventory.manifest.totals.candidatePairs, 2);
    assert.equal(inventory.manifest.totals.pairsWithIssues, 2);
    assert.ok(inventory.manifest.globalIssues.some(issue => issue.code === 'legacy-chat-id-collision'));
    assert.ok(inventory.manifest.pairs.every(pair => pair.issues.includes('legacy-chat-id-collision')));
});

test('sentinel summary is ignored only when it has no partner ID', () => {
    const inventory = buildLegacyChatInventory({
        summaries: [
            { path: 'users/alice/chats/_init', id: '_init', data: { createdAt: stamp } },
            summary('alice', 'bob'),
            summary('bob', 'alice')
        ],
        messagesByChat: { alice_bob: [message('message-1')] }
    });

    assert.equal(inventory.manifest.totals.ignoredSentinelDocuments, 1);
    assert.equal(inventory.manifest.totals.candidatePairs, 1);
});

test('inventory manifest is deterministic regardless of source document order', () => {
    const summaries = [summary('alice', 'bob'), summary('bob', 'alice')];
    const messages = { alice_bob: [message('z-message'), message('a-message', 'bob')] };
    const first = buildLegacyChatInventory({ summaries, messagesByChat: messages });
    const second = buildLegacyChatInventory({
        summaries: [...summaries].reverse(),
        messagesByChat: { alice_bob: [...messages.alice_bob].reverse() }
    });

    assert.equal(first.manifestSha256, second.manifestSha256);
    assert.deepEqual(first.manifest, second.manifest);
});

test('unexpected summary paths are reported rather than silently treated as chats', () => {
    const inventory = buildLegacyChatInventory({
        summaries: [{ path: 'users/alice/friends/bob', id: 'bob', data: { partnerId: 'bob' } }],
        messagesByChat: {}
    });

    assert.equal(inventory.manifest.totals.candidatePairs, 0);
    assert.equal(inventory.manifest.globalIssues[0].code, 'unexpected-summary-path');
});
