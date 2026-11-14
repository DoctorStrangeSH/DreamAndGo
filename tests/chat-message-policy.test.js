import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CHAT_MESSAGE_LENGTH, validateChatMessage, validChatParticipants } from '../js/core/chat-message-policy.js';

const getChatId = (a, b) => [a, b].sort().join('_');

test('chat message validation rejects empty and non-string payloads', () => {
    for (const value of ['', '   ', '\n\t', null, undefined, 123, {}]) {
        assert.equal(validateChatMessage(value).valid, false);
    }
});

test('chat messages are trimmed and capped at 2000 characters', () => {
    assert.deepEqual(validateChatMessage('  привет  '), { valid: true, text: 'привет' });
    assert.equal(validateChatMessage('a'.repeat(MAX_CHAT_MESSAGE_LENGTH)).valid, true);
    assert.equal(validateChatMessage('a'.repeat(MAX_CHAT_MESSAGE_LENGTH + 1)).valid, false);
});

test('sender must be the logged-in user and chat must match the participants', () => {
    assert.equal(validChatParticipants('alice', 'alice', 'bob', 'alice_bob', getChatId), true);
    assert.equal(validChatParticipants('bob', 'alice', 'bob', 'alice_bob', getChatId), false);
    assert.equal(validChatParticipants('alice', 'alice', 'alice', 'alice_alice', getChatId), false);
    assert.equal(validChatParticipants('alice', 'alice', 'bob', 'alice_eve', getChatId), false);
    assert.equal(validChatParticipants(null, 'alice', 'bob', 'alice_bob', getChatId), false);
});

test('legacy underscore chat IDs are ambiguous and need a server-side migration', () => {
    assert.equal(getChatId('a_b', 'c'), getChatId('a', 'b_c'));
});
