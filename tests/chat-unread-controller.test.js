import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatUnreadController } from '../js/core/chat-unread-controller.js';

test('valid server count replaces pending status for one chat', async () => {
    const states = [];
    const controller = new ChatUnreadController(async ({ chatId }) => ({ chatId, unread: 4 }),
        state => states.push(state?.status));
    assert.deepEqual(await controller.refresh('chat-a'), { status: 'ready', unread: 4 });
    assert.deepEqual(controller.get('chat-a'), { chatId: 'chat-a', status: 'ready', unread: 4 });
    assert.deepEqual(states, ['checking', 'ready']);
});

test('offline, malformed and mismatched server responses never publish an invented count', async () => {
    let response = { chatId: 'wrong', unread: 8 };
    const controller = new ChatUnreadController(async () => response);
    for (const invalid of [response, { chatId: 'chat-a', unread: -1 },
        { chatId: 'chat-a', unread: 1.5 }, { chatId: 'chat-a', unread: '9' }]) {
        response = invalid;
        assert.deepEqual(await controller.refresh('chat-a'), { status: 'unknown' });
        assert.equal(controller.get('chat-a').unread, null);
    }
    response = null;
    assert.deepEqual(await controller.refresh('chat-a'), { status: 'unknown' });
    const offline = new ChatUnreadController(async () => { throw new Error('offline'); });
    assert.deepEqual(await offline.refresh('chat-a'), { status: 'unknown' });
    assert.deepEqual(offline.get('chat-a'), { chatId: 'chat-a', status: 'unknown', unread: null });
});

test('parallel refreshes share one request and do not overwrite other chats', async () => {
    let resolve, requests = 0;
    const controller = new ChatUnreadController(() => {
        requests++;
        return new Promise(done => { resolve = done; });
    });
    const a = controller.refresh('chat-a');
    const b = controller.refresh('chat-a');
    assert.strictEqual(a, b);
    await Promise.resolve();
    assert.equal(requests, 1);
    resolve({ chatId: 'chat-a', unread: 2 });
    assert.deepEqual(await a, { status: 'ready', unread: 2 });
    assert.equal(controller.get('chat-b'), null);
});

test('logout invalidates late response even when chat IDs are reused by next account', async () => {
    let done;
    const controller = new ChatUnreadController(() => new Promise(resolve => { done = resolve; }));
    const pending = controller.refresh('chat-a');
    await Promise.resolve();
    controller.clear();
    assert.equal(controller.get('chat-a'), null);
    done({ chatId: 'chat-a', unread: 99 });
    assert.deepEqual(await pending, { status: 'stale' });
    assert.equal(controller.get('chat-a'), null);
});

test('removed chat ignores a delayed result and allows a fresh lookup', async () => {
    let done;
    const controller = new ChatUnreadController(() => new Promise(resolve => { done = resolve; }));
    const old = controller.refresh('chat-a');
    await Promise.resolve();
    controller.remove('chat-a');
    done({ chatId: 'chat-a', unread: 6 });
    assert.deepEqual(await old, { status: 'stale' });
    assert.equal(controller.get('chat-a'), null);
});

test('rejects malformed chat IDs without calling transport', () => {
    const controller = new ChatUnreadController(() => { throw new Error('must not run'); });
    for (const id of ['', 'bad/path', 'x'.repeat(129), null]) {
        assert.throws(() => controller.refresh(id), TypeError);
    }
});
