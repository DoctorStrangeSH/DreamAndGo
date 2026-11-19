import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeHistoryRequest, authorizeHistoryChat, buildHistoryPage
} from '../server/chat-history-policy.js';

const chat = { version: 2, state: 'active', participants: ['alice', 'bob'] };
const clearBlock = { exists: false };
const message = sequence => ({
    id: sequence.toString(16).padStart(64, '0'), sequence,
    senderId: sequence % 2 ? 'alice' : 'bob',
    text: 'Сообщение ' + sequence, read: false
});

test('history request requires a real session, safe chat ID and bounded cursor/page size', () => {
    assert.deepEqual(normalizeHistoryRequest(null, { chatId: 'chat-a', limit: 30 }),
        { ok: false, code: 'unauthenticated' });
    assert.deepEqual(normalizeHistoryRequest('alice', { chatId: 'chat-a', limit: 30 }), {
        ok: true, chatId: 'chat-a', beforeSequence: null, limit: 30
    });
    for (const data of [
        { chatId: 'bad/id', limit: 1 },
        { chatId: ' chat-a', limit: 1 },
        { chatId: 'chat-a ', limit: 1 },
        { chatId: 'c'.repeat(129), limit: 1 },
        { chatId: 'chat-a', limit: 0 },
        { chatId: 'chat-a', limit: 51 },
        { chatId: 'chat-a', limit: 10, beforeSequence: -1 },
        { chatId: 'chat-a', limit: 10, beforeSequence: '12' },
        { chatId: 'chat-a', limit: 10, beforeSequence: 0 }
    ]) {
        assert.equal(normalizeHistoryRequest('alice', data).ok, false);
    }
    for (const uid of ['', ' alice', 'alice ', 'a/b', 'u'.repeat(129)]) {
        assert.equal(normalizeHistoryRequest(uid, { chatId: 'chat-a', limit: 1 }).ok, false);
    }
});

test('history rejects non-participants, inactive chats and blocking in either direction', () => {
    assert.deepEqual(authorizeHistoryChat(chat, 'alice', clearBlock, clearBlock),
        { ok: true, partnerId: 'bob' });
    assert.deepEqual(authorizeHistoryChat(chat, 'mallory', clearBlock, clearBlock),
        { ok: false, code: 'permission-denied' });
    assert.deepEqual(authorizeHistoryChat({ ...chat, state: 'frozen' },
        'alice', clearBlock, clearBlock), { ok: false, code: 'failed-precondition' });
    assert.equal(authorizeHistoryChat(chat, 'alice', { exists: true }, clearBlock).ok, false);
    assert.equal(authorizeHistoryChat(chat, 'alice', clearBlock, { exists: true }).ok, false);
    assert.equal(authorizeHistoryChat(chat, 'alice', undefined, clearBlock).ok, false);
});

test('server-side limit+1 pagination emits only requested messages and exact cursor', () => {
    const first = buildHistoryPage('chat-a', [message(5), message(4), message(3)], null, 2);
    assert.deepEqual(first.messages.map(row => row.sequence), [5, 4]);
    assert.equal(first.hasMore, true);
    assert.equal(first.nextBeforeSequence, 4);
    const second = buildHistoryPage('chat-a', [message(3), message(2)], 4, 2);
    assert.deepEqual(second.messages.map(row => row.sequence), [3, 2]);
    assert.equal(second.hasMore, false);
    assert.equal(second.nextBeforeSequence, null);
    assert.equal('clientMessageId' in first.messages[0], false);
});

test('server response fails closed on invalid order, duplicate IDs or malformed fields', () => {
    assert.throws(() => buildHistoryPage('chat-a', [message(4), message(5)], null, 2), TypeError);
    assert.throws(() => buildHistoryPage('chat-a', [message(4), message(4)], null, 2), TypeError);
    assert.throws(() => buildHistoryPage('chat-a', [message(4)], 4, 2), TypeError);
    assert.throws(() => buildHistoryPage('chat-a', [{ ...message(4), text: '' }], null, 2), TypeError);
    assert.throws(() => buildHistoryPage('chat-a', [{ ...message(4), read: 'no' }], null, 2), TypeError);
    assert.throws(() => buildHistoryPage('chat-a', [message(5), message(4), message(3), message(2)], null, 2), TypeError);
});
