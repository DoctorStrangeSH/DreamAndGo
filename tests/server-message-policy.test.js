import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChatMessage, otherChatParticipant } from '../server/message-policy.js';

test('server message normalization rejects empty, invalid and oversized input', () => {
    for (const value of ['', '  ', '\n', null, undefined, 13, {}, 'x'.repeat(2001)]) {
        assert.equal(normalizeChatMessage(value), null);
    }
    assert.equal(normalizeChatMessage('  Привет!  '), 'Привет!');
    assert.equal(normalizeChatMessage('a'.repeat(2000)).length, 2000);
});

test('only a member of a valid two-person chat resolves the recipient', () => {
    assert.equal(otherChatParticipant(['alice', 'bob'], 'alice'), 'bob');
    assert.equal(otherChatParticipant(['alice', 'bob'], 'bob'), 'alice');
    assert.equal(otherChatParticipant(['alice', 'bob'], 'charlie'), null);
    assert.equal(otherChatParticipant(['alice', 'alice'], 'alice'), null);
    assert.equal(otherChatParticipant(['alice'], 'alice'), null);
    assert.equal(otherChatParticipant(['alice', '', 'bob'], 'alice'), null);
    assert.equal(otherChatParticipant(null, 'alice'), null);
});
