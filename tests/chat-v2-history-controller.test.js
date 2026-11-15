import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatV2HistoryController } from '../js/core/chat-v2-history-controller.js';

const id = n => n.toString(16).padStart(64, '0');
const msg = n => ({ id: id(n), sequence: n, senderId: n % 2 ? 'alice' : 'bob',
    text: 'Текст ' + n, read: false });

test('history loads newest first, pages older by exact sequence, presents chronological order', async () => {
    const calls = [], events = [];
    const pages = [
        { chatId: 'chat-a', messages: [msg(5), msg(4), msg(3)],
            hasMore: true, nextBeforeSequence: 3 },
        { chatId: 'chat-a', messages: [msg(2), msg(1)],
            hasMore: false, nextBeforeSequence: null }
    ];
    const history = new ChatV2HistoryController(request => {
        calls.push(request);
        return pages.shift();
    }, state => events.push(state), 3);
    await history.open('chat-a');
    assert.deepEqual(calls[0], { chatId: 'chat-a', beforeSequence: null, limit: 3 });
    assert.deepEqual(history.snapshot().messages.map(item => item.sequence), [3, 4, 5]);
    await history.loadOlder();
    assert.deepEqual(calls[1], { chatId: 'chat-a', beforeSequence: 3, limit: 3 });
    assert.deepEqual(history.snapshot().messages.map(item => item.sequence), [1, 2, 3, 4, 5]);
    assert.equal(history.snapshot().hasMore, false);
    await history.loadOlder();
    assert.equal(calls.length, 2);
    assert.ok(events.some(state => state.status === 'loading'));
});

test('malformed response never marks a successful page nor invents history', async () => {
    let response = { chatId: 'wrong', messages: [msg(3)], hasMore: false,
        nextBeforeSequence: null };
    const history = new ChatV2HistoryController(async () => response);
    assert.equal((await history.open('chat-a')).status, 'error');
    assert.deepEqual(history.snapshot().messages, []);
    response = { chatId: 'chat-a', messages: [msg(3), msg(3)],
        hasMore: true, nextBeforeSequence: 3 };
    assert.equal((await history.loadOlder()).status, 'error');
    response = { chatId: 'chat-a', messages: [msg(3)],
        hasMore: true, nextBeforeSequence: 2 };
    assert.equal((await history.loadOlder()).status, 'error');
    response = { chatId: 'chat-a', messages: [msg(3)],
        hasMore: false, nextBeforeSequence: null };
    assert.equal((await history.loadOlder()).status, 'ready');
    assert.deepEqual(history.snapshot().messages.map(x => x.sequence), [3]);
});

test('overlapping requests for the same page coalesce and old-account results are dropped', async () => {
    let resolveOld, calls = 0;
    const history = new ChatV2HistoryController(() => {
        calls++;
        return new Promise(resolve => { resolveOld = resolve; });
    });
    const first = history.open('chat-a');
    await Promise.resolve();
    const second = history.loadOlder();
    assert.equal(calls, 1);
    history.clear();
    resolveOld({ chatId: 'chat-a', messages: [msg(1)], hasMore: false, nextBeforeSequence: null });
    assert.equal((await first).status, 'stale');
    assert.equal((await second).status, 'stale');
    assert.equal(history.snapshot().chatId, null);
    assert.deepEqual(history.snapshot().messages, []);
});

test('rejects bad chat IDs and unreasonable page sizes', async () => {
    assert.throws(() => new ChatV2HistoryController(async () => ({}), () => {}, 100), TypeError);
    const history = new ChatV2HistoryController(async () => ({}));
    await assert.rejects(history.open('bad/id'), TypeError);
});

test('message snapshot is immutable and forged HTML stays inert data', async () => {
    const history = new ChatV2HistoryController(async () => ({
        chatId: 'chat-a', messages: [{ ...msg(1), text: '<img onerror=alert(1)>' }],
        hasMore: false, nextBeforeSequence: null
    }));
    const state = await history.open('chat-a');
    assert.equal(state.messages[0].text, '<img onerror=alert(1)>');
    assert.equal(Object.isFrozen(state.messages), true);
    assert.equal(Object.isFrozen(state.messages[0]), true);
});
