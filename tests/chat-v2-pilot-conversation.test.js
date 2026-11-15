import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatV2PilotConversation } from '../js/core/chat-v2-pilot-conversation.js';
import { renderChatV2Pilot } from '../js/core/chat-v2-pilot-view.js';

const message = n => ({
    id: n.toString(16).padStart(64, '0'), sequence: n,
    senderId: n % 2 ? 'alice' : 'bob', text: 'Сообщение ' + n, read: false
});

function harness(lookup) {
    const snapshots = [];
    const view = {
        mountCalls: 0, destroyed: false, options: null,
        mount() { this.mountCalls++; },
        setHistoryState(state) { snapshots.push(state); },
        destroy() { this.destroyed = true; }
    };
    const conversation = new ChatV2PilotConversation({
        root: {}, session: { userId: 'alice' },
        chatId: 'chat-a', title: 'Боб', lookup,
        viewFactory: options => { view.options = options; return view; },
        limit: 2
    });
    return { view, conversation, snapshots };
}

test('pilot conversation connects history snapshots and Load older to one paginator', async () => {
    const requests = [];
    const pages = [
        { chatId: 'chat-a', messages: [message(4), message(3)], hasMore: true, nextBeforeSequence: 3 },
        { chatId: 'chat-a', messages: [message(2), message(1)], hasMore: false, nextBeforeSequence: null }
    ];
    const h = harness(async req => { requests.push(req); return pages.shift(); });
    await h.conversation.mount();
    assert.equal(h.view.mountCalls, 1);
    assert.deepEqual(h.snapshots.at(-1).messages.map(x => x.sequence), [3, 4]);
    await h.view.options.onLoadOlder();
    assert.deepEqual(h.snapshots.at(-1).messages.map(x => x.sequence), [1, 2, 3, 4]);
    assert.equal(h.snapshots.at(-1).hasMore, false);
    assert.deepEqual(requests.map(x => x.beforeSequence), [null, 3]);
    h.conversation.dispose();
    assert.equal(h.view.destroyed, true);
});

test('history transport failure exposes retryable error without discarding already loaded messages', async () => {
    let calls = 0;
    const h = harness(async () => {
        calls++;
        if (calls === 2) throw new Error('offline');
        return calls === 1
            ? { chatId: 'chat-a', messages: [message(2)], hasMore: true, nextBeforeSequence: 2 }
            : { chatId: 'chat-a', messages: [message(1)], hasMore: false, nextBeforeSequence: null };
    });
    await h.conversation.mount();
    assert.equal((await h.conversation.loadOlder()).status, 'error');
    assert.deepEqual(h.snapshots.at(-1).messages.map(x => x.sequence), [2]);
    assert.equal((await h.conversation.loadOlder()).status, 'ready');
    assert.deepEqual(h.snapshots.at(-1).messages.map(x => x.sequence), [1, 2]);
    h.conversation.dispose();
});

test('dispose invalidates late pages and suppresses subsequent UI changes', async () => {
    let finish;
    const h = harness(() => new Promise(resolve => { finish = resolve; }));
    const waiting = h.conversation.mount();
    await Promise.resolve();
    h.conversation.dispose();
    const eventsBefore = h.snapshots.length;
    finish({ chatId: 'chat-a', messages: [message(1)], hasMore: false, nextBeforeSequence: null });
    assert.equal((await waiting).status, 'stale');
    assert.equal(h.snapshots.length, eventsBefore);
    assert.equal((await h.conversation.loadOlder()).status, 'stale');
    await assert.rejects(h.conversation.mount(), /закрыт/);
});

test('pilot markup includes semantic Load older control and status message', () => {
    const html = renderChatV2Pilot({ userId: 'alice' });
    assert.match(html, /chat-v2-pilot__older/);
    assert.match(html, /Загрузить ранние/);
    assert.match(html, /chat-v2-pilot__history-status/);
});
