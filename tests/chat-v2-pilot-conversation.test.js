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

test('confirmed send reopens newest history and invalidates older pagination', async () => {
    const requests = [];
    const h = harness(async req => {
        requests.push(req);
        return requests.length === 1
            ? { chatId: 'chat-a', messages: [message(2), message(1)],
                hasMore: false, nextBeforeSequence: null }
            : { chatId: 'chat-a', messages: [message(3), message(2)],
                hasMore: true, nextBeforeSequence: 2 };
    });
    await h.conversation.mount();
    await h.view.options.onSent();
    assert.deepEqual(requests.map(req => req.beforeSequence), [null, null]);
    assert.deepEqual(h.snapshots.at(-1).messages.map(row => row.sequence), [2, 3]);
    h.conversation.dispose();
});


test('pilot wires only visible unread incoming messages to one managed receipt tracker', async () => {
    const observed = new Set();
    const unobserved = [];
    let stopped = 0;
    let trackerOptions;
    let latestMessages = [];
    const listRoot = { contains: element => observed.has(element) || element.connected === true };
    const view = {
        mount() {},
        setHistoryState(state) {
            latestMessages = state.messages;
            this.items = state.messages
                .filter(row => row.senderId !== 'alice' && row.read !== true)
                .map(row => ({ element: { connected: true }, message: row }));
        },
        getMessageListElement: () => listRoot,
        getIncomingMessageElements() { return this.items || []; },
        destroy() {}
    };
    const session = {
        userId: 'alice',
        getUserId: () => 'alice',
        watchIncoming(options) {
            trackerOptions = options;
            return {
                observe(element, row) {
                    observed.add(element);
                    return row.senderId !== 'alice' && row.read !== true;
                },
                unobserve(element) { observed.delete(element); unobserved.push(element); },
                stop() { stopped++; }
            };
        },
        stopWatchingIncoming(tracker) { tracker.stop(); return true; }
    };
    const pages = [
        { chatId: 'chat-a', messages: [message(2), message(1)], hasMore: false, nextBeforeSequence: null },
        { chatId: 'chat-a', messages: [message(4), message(3)], hasMore: false, nextBeforeSequence: null }
    ];
    const conversation = new ChatV2PilotConversation({
        root: {}, session, chatId: 'chat-a', lookup: async () => pages.shift(),
        viewFactory: () => view,
        observerFactory: () => ({}),
        documentRef: { visibilityState: 'visible' }
    });
    await conversation.mount();
    assert.equal(typeof trackerOptions.isActive, 'function');
    assert.equal(trackerOptions.chatId, 'chat-a');
    assert.equal(trackerOptions.root, listRoot);
    assert.equal(observed.size, 1);
    const oldElement = [...observed][0];
    await conversation.refreshLatest();
    assert.equal(observed.size, 1);
    assert.ok(unobserved.includes(oldElement));
    assert.equal(latestMessages.length, 2);
    conversation.dispose();
    assert.equal(stopped, 1);
    assert.equal(observed.size, 0);
});


test('pilot history remains usable when browser visibility observation is unavailable', async () => {
    const snapshots = [];
    const page = { chatId: 'chat-a', messages: [message(2), message(1)], hasMore: false, nextBeforeSequence: null };
    const view = {
        mount() {},
        setHistoryState(state) { snapshots.push(state); },
        getMessageListElement() { return {}; },
        getIncomingMessageElements() { return []; },
        destroy() {}
    };
    const session = {
        userId: 'alice',
        getUserId: () => 'alice',
        watchIncoming() { throw new Error('IntersectionObserver unavailable'); }
    };
    const conversation = new ChatV2PilotConversation({
        root: {}, session, chatId: 'chat-a', lookup: async () => page,
        viewFactory: () => view
    });
    const result = await conversation.mount();
    assert.equal(result.status, 'ready');
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].messages.length, 2);
    assert.equal(conversation.readTrackingUnavailable, true);
    conversation.dispose();
});


test('pilot decorates only confirmed outgoing delivery states and refreshes server read receipts', async () => {
    const outgoing = message(1);
    const states = new Map([['550e8400-e29b-41d4-a716-446655440000', {
        messageId: outgoing.id, deliveryStatus: 'sent'
    }]]);
    const snapshots = [];
    const view = {
        mount() {},
        setHistoryState(state) { snapshots.push(state); },
        destroy() {}
    };
    const session = {
        userId: 'alice',
        delivery: { messages: states },
        async refreshRead(clientMessageId) {
            const state = states.get(clientMessageId);
            state.deliveryStatus = 'read';
            return { status: 'read' };
        }
    };
    const conversation = new ChatV2PilotConversation({
        root: {}, session, chatId: 'chat-a',
        lookup: async () => ({
            chatId: 'chat-a', messages: [outgoing], hasMore: false, nextBeforeSequence: null
        }),
        viewFactory: () => view
    });
    await conversation.mount();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(snapshots[0].messages[0].deliveryStatus, 'sent');
    assert.equal(snapshots.at(-1).messages[0].deliveryStatus, 'read');
    conversation.dispose();
});
