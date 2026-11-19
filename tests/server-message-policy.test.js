import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChatMessage, otherChatParticipant, normalizeClientMessageId, serverMessageDocumentId, isValidUserId, isValidDocumentId } from '../server/message-policy.js';

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

test('message IDs are stable across delivery retries and UUID casing', () => {
    const requestId = '550e8400-e29b-41d4-a716-446655440000';
    const expected = serverMessageDocumentId('chat_1', 'alice', requestId);
    assert.match(expected, /^[0-9a-f]{64}$/);
    assert.equal(serverMessageDocumentId('chat_1', 'alice', requestId), expected);
    assert.equal(serverMessageDocumentId('chat_1', 'alice', requestId.toUpperCase()), expected);
    assert.equal(normalizeClientMessageId(requestId.toUpperCase()), requestId);
});

test('message IDs do not collide across sender, chat or client action', () => {
    const key = '550e8400-e29b-41d4-a716-446655440000';
    const differentKey = '550e8400-e29b-41d4-a716-446655440001';
    const ids = [
        serverMessageDocumentId('chat_1', 'alice', key),
        serverMessageDocumentId('chat_1', 'bob', key),
        serverMessageDocumentId('chat_2', 'alice', key),
        serverMessageDocumentId('chat_1', 'alice', differentKey),
        serverMessageDocumentId('a', 'bc', key),
        serverMessageDocumentId('ab', 'c', key)
    ];
    assert.equal(new Set(ids).size, ids.length);
});

test('message ID validation rejects arbitrary, malformed or non-v4 request keys', () => {
    for (const bad of [undefined, null, {}, '', '123', 'some arbitrary key',
        '550e8400-e29b-11d4-a716-446655440000',
        '550e8400-e29b-41d4-0716-446655440000']) {
        assert.equal(normalizeClientMessageId(bad), null);
        assert.equal(serverMessageDocumentId('chat_1', 'alice', bad), null);
    }
    assert.equal(serverMessageDocumentId('', 'alice', '550e8400-e29b-41d4-a716-446655440000'), null);
    assert.equal(serverMessageDocumentId('chat_1', '', '550e8400-e29b-41d4-a716-446655440000'), null);
});


test('server participant and Firestore path identifiers reject malformed values', () => {
    for (const uid of ['alice', 'u'.repeat(128)]) assert.equal(isValidUserId(uid), true);
    for (const uid of ['', ' ', ' alice', 'alice ', 'a/b', 'u'.repeat(129), null, 42]) {
        assert.equal(isValidUserId(uid), false);
        assert.equal(otherChatParticipant([uid, 'bob'], uid), null);
    }
    assert.equal(isValidDocumentId('chat-123'), true);
    assert.equal(isValidDocumentId('c'.repeat(129)), false);
    assert.equal(isValidDocumentId('chat/child'), false);
    assert.equal(isValidDocumentId(' chat'), false);
});

test('server message document IDs refuse malformed chat and sender path segments', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    for (const chatId of ['', ' chat', 'chat ', 'chat/child', 'c'.repeat(129)]) {
        assert.equal(serverMessageDocumentId(chatId, 'alice', uuid), null);
    }
    for (const senderId of ['', ' alice', 'alice ', 'alice/other', 'u'.repeat(129)]) {
        assert.equal(serverMessageDocumentId('chat-123', senderId, uuid), null);
    }
});
