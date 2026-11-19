import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceReadCursor, countUnreadIncoming, mergeReadCursor } from '../server/chat-unread-cursor.js';

const messages = [
    { sequence: 1, senderId: 'alice' },
    { sequence: 2, senderId: 'alice' },
    { sequence: 3, senderId: 'bob' },
    { sequence: 4, senderId: 'alice' },
    { sequence: 5, senderId: 'alice' }
];

test('unread count is derived from incoming messages after the shared cursor', () => {
    assert.equal(countUnreadIncoming(messages, 'bob', 0), 4);
    assert.equal(countUnreadIncoming(messages, 'bob', 2), 2);
    assert.equal(countUnreadIncoming(messages, 'bob', 5), 0);
});

test('cursor advances monotonically and never regresses from stale device state', () => {
    assert.equal(advanceReadCursor(2, 4), 4);
    assert.equal(mergeReadCursor(4, 2), 4);
    assert.equal(mergeReadCursor(4, 7), 7);
});

test('outgoing messages do not count as unread for their sender', () => {
    assert.equal(countUnreadIncoming(messages, 'alice', 0), 1);
});

test('rejects malformed cursors and messages without server sequence', () => {
    assert.throws(() => advanceReadCursor(-1, 2), /cursor/i);
    assert.throws(() => advanceReadCursor(1, 1.5), /cursor/i);
    assert.throws(() => countUnreadIncoming([{ senderId: 'alice' }], 'bob', 0), /sequence/i);
});


test('unread counting rejects malformed current-user and message sender IDs', () => {
    for (const uid of ['', ' alice', 'alice ', 'alice/other', 'u'.repeat(129)]) {
        assert.throws(() => countUnreadIncoming(messages, uid, 0), /current user/i);
    }
    for (const senderId of ['', ' bob', 'bob ', 'bob/other', 'u'.repeat(129), undefined]) {
        assert.throws(() => countUnreadIncoming([
            { sequence: 1, senderId }
        ], 'alice', 0), /sequence/i);
    }
});
