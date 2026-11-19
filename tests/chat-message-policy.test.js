import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CHAT_MESSAGE_LENGTH, validateChatMessage, validChatParticipants, isValidChatUid } from '../js/core/chat-message-policy.js';

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


test('chat UIDs are safe Firestore path segments', () => {
    for (const uid of ['alice', 'firebase-user-123', 'a'.repeat(128)]) {
        assert.equal(isValidChatUid(uid), true);
    }
    for (const uid of ['', ' ', ' alice', 'alice ', 'a/b', 'a'.repeat(129), null, undefined, 42]) {
        assert.equal(isValidChatUid(uid), false);
    }
});

test('chat participant validation rejects unsafe IDs before deriving a chat path', () => {
    assert.equal(validChatParticipants('alice', 'alice', 'bob', 'alice_bob', getChatId), true);
    assert.equal(validChatParticipants('alice', 'alice', 'bad/uid', 'alice_bad/uid', getChatId), false);
    assert.equal(validChatParticipants('alice', 'alice', 'b'.repeat(129), 'alice_' + 'b'.repeat(129), getChatId), false);
    assert.equal(validChatParticipants('alice ', 'alice ', 'bob', 'alice _bob', getChatId), false);
});
