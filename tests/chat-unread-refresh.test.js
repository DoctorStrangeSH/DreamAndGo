import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatUnreadController } from '../js/core/chat-unread-controller.js';
import { ChatUnreadRefreshCoordinator } from '../js/core/chat-unread-refresh.js';

function target(extra = {}) {
    const listeners = new Map();
    return {
        ...extra,
        addEventListener(name, fn) { listeners.set(name, fn); },
        removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
        emit(name) { listeners.get(name)?.(); },
        size() { return listeners.size; }
    };
}

test('starts refresh, deduplicates chat IDs and throttles focus/online storms', async () => {
    let clock = 10_000;
    const calls = [];
    const controller = new ChatUnreadController(async ({ chatId }) => {
        calls.push(chatId);
        return { chatId, unread: 2 };
    });
    const win = target({ navigator: { onLine: true } });
    const doc = target({ visibilityState: 'visible' });
    const refresh = new ChatUnreadRefreshCoordinator(controller, () => ['a', 'b', 'a'], win, doc,
        { now: () => clock, minIntervalMs: 5000 });
    assert.deepEqual(await refresh.start(), { status: 'checked', chats: 2 });
    assert.deepEqual(calls, ['a', 'b']);
    win.emit('online');
    doc.emit('visibilitychange');
    await Promise.resolve();
    assert.equal(calls.length, 2);
    clock += 5000;
    assert.deepEqual(await refresh.refreshNow(), { status: 'checked', chats: 2 });
    assert.equal(calls.length, 4);
    refresh.stop();
    assert.equal(win.size(), 0);
    assert.equal(doc.size(), 0);
});

test('offline and background tabs never start server requests', async () => {
    let count = 0;
    const controller = new ChatUnreadController(async ({ chatId }) => {
        count++;
        return { chatId, unread: 0 };
    });
    const win = target({ navigator: { onLine: false } });
    const doc = target({ visibilityState: 'visible' });
    const refresh = new ChatUnreadRefreshCoordinator(controller, () => ['a'], win, doc,
        { minIntervalMs: 0 });
    assert.deepEqual(await refresh.start(), { status: 'paused' });
    assert.equal(count, 0);
    doc.visibilityState = 'hidden';
    win.navigator.onLine = true;
    win.emit('online');
    assert.equal(count, 0);
    doc.visibilityState = 'visible';
    doc.emit('visibilitychange');
    await refresh.refreshNow();
    assert.equal(count, 1);
    refresh.stop();
});

test('logout detaches listeners and rejects a late server result', async () => {
    let finish;
    const controller = new ChatUnreadController(() => new Promise(resolve => { finish = resolve; }));
    const win = target({ navigator: { onLine: true } });
    const doc = target({ visibilityState: 'visible' });
    const refresh = new ChatUnreadRefreshCoordinator(controller, () => ['a'], win, doc);
    const pending = refresh.start();
    await Promise.resolve();
    refresh.stop();
    finish({ chatId: 'a', unread: 7 });
    await pending;
    assert.equal(controller.get('a'), null);
    win.emit('online');
    assert.equal(win.size(), 0);
    assert.equal(doc.size(), 0);
});

test('invalid chat list cannot produce partial refresh requests', async () => {
    let count = 0;
    const controller = new ChatUnreadController(async () => { count++; });
    const win = target({ navigator: { onLine: true } });
    const doc = target({ visibilityState: 'visible' });
    const refresh = new ChatUnreadRefreshCoordinator(controller, () => ['valid', 'bad/id'], win, doc);
    assert.deepEqual(await refresh.start(), { status: 'invalid-source' });
    assert.equal(count, 0);
    refresh.stop();
});
