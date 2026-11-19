import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatV2Session } from '../js/core/chat-v2-session.js';
import { ChatPendingIntentStore } from '../js/core/chat-pending-store.js';

const uuid = '550e8400-e29b-41d4-a716-446655440000';
const messageId = 'a'.repeat(64);
const tick = () => new Promise(resolve => setImmediate(resolve));

function fakeServer() {
    const calls = [];
    const messages = new Map();
    const invokeFor = userId => async (name, payload) => {
        calls.push({ userId, name, payload });
        switch (name) {
            case 'createPrivateChatV2':
                return { data: { chatId: 'chat-a', version: 2 } };
            case 'sendPrivateMessageV2': {
                if (userId !== 'alice') throw new Error('wrong sender');
                if (!messages.has(payload.clientMessageId)) {
                    messages.set(payload.clientMessageId, { id: messageId, sender: userId, read: false });
                }
                return { data: { chatId: payload.chatId, messageId } };
            }
            case 'getPrivateMessageStatusV2': {
                if (userId !== 'alice') throw new Error('sender only');
                const record = messages.get(payload.clientMessageId);
                return { data: record
                    ? { status: 'sent', messageId: record.id, read: record.read }
                    : { status: 'missing' } };
            }
            case 'getPrivateChatUnreadV2':
                return { data: { chatId: payload.chatId, unread: [...messages.values()]
                    .filter(item => item.sender !== userId && !item.read).length } };
            case 'markPrivateMessageReadV2': {
                if (userId !== 'bob') throw new Error('recipient only');
                const record = [...messages.values()].find(item => item.id === payload.messageId);
                if (!record) throw new Error('not found');
                record.read = true;
                return { data: { status: 'read', messageId: record.id } };
            }
            default:
                throw new Error('Unexpected endpoint: ' + name);
        }
    };
    return { calls, invokeFor, messages };
}

function visibilityHarness() {
    const elements = new Set();
    const root = { contains: element => elements.has(element) };
    const documentRef = {
        visibilityState: 'visible',
        addEventListener() {},
        removeEventListener() {}
    };
    let notify, disconnected = false;
    const observerFactory = callback => {
        notify = callback;
        return { observe() {}, unobserve() {}, disconnect() { disconnected = true; } };
    };
    const element = { isConnected: true };
    elements.add(element);
    return {
        root, documentRef, observerFactory, element,
        visible: ratio => notify([{ target: element, isIntersecting: ratio > 0, intersectionRatio: ratio }]),
        disconnected: () => disconnected
    };
}

test('candidate two-user flow: create → send → unread → visible receipt → sender read', async () => {
    const server = fakeServer();
    const deliveryEvents = [], unreadEvents = [];
    const alice = new ChatV2Session({
        invoke: server.invokeFor('alice'), getUserId: () => 'alice',
        createId: () => uuid, onDeliveryChange: state => deliveryEvents.push(state)
    });
    const bob = new ChatV2Session({
        invoke: server.invokeFor('bob'), getUserId: () => 'bob',
        onUnreadChange: state => unreadEvents.push(state)
    });
    assert.deepEqual(await alice.createChat('bob'), { chatId: 'chat-a', version: 2 });
    const intent = alice.prepare('chat-a', 'Привет!');
    assert.equal(alice.delivery.get(uuid).deliveryStatus, 'sending');
    assert.equal((await alice.send(intent.clientMessageId)).success, true);
    assert.equal(alice.delivery.get(uuid).deliveryStatus, 'sent');
    assert.deepEqual(await bob.refreshUnread('chat-a'), { status: 'ready', unread: 1 });
    assert.equal((await alice.refreshRead(uuid)).status, 'unconfirmed');

    const dom = visibilityHarness();
    const tracker = bob.watchIncoming({ chatId: 'chat-a', ...dom, isActive: () => true });
    assert.equal(tracker.observe(dom.element, { id: messageId, senderId: 'alice' }), true);
    dom.visible(0.5);
    await tick();
    assert.equal(server.calls.filter(item => item.name === 'markPrivateMessageReadV2').length, 0);
    dom.visible(1);
    await tick();
    await tick();
    assert.equal(server.calls.filter(item => item.name === 'markPrivateMessageReadV2').length, 1);
    assert.deepEqual(bob.unread.get('chat-a'), { chatId: 'chat-a', status: 'ready', unread: 0 });
    assert.equal((await alice.refreshRead(uuid)).status, 'read');
    assert.equal(alice.delivery.get(uuid).deliveryStatus, 'read');
    assert.equal(unreadEvents.at(-1).unread, 0);
    assert.equal(deliveryEvents.at(-1).deliveryStatus, 'read');
    alice.dispose();
    bob.dispose();
    assert.equal(dom.disconnected(), true);
});

test('inactive or hidden conversations cannot mark incoming messages read', async () => {
    const server = fakeServer();
    const bob = new ChatV2Session({ invoke: server.invokeFor('bob'), getUserId: () => 'bob' });
    const dom = visibilityHarness();
    let active = false;
    const tracker = bob.watchIncoming({ chatId: 'chat-a', ...dom, isActive: () => active });
    tracker.observe(dom.element, { id: messageId, senderId: 'alice' });
    dom.visible(1);
    await tick();
    active = true;
    dom.documentRef.visibilityState = 'hidden';
    dom.visible(1);
    await tick();
    assert.equal(server.calls.length, 0);
    bob.dispose();
});

test('logout clears view models, blocks new calls and suppresses late acknowledgements', async () => {
    let resolveSend, userId = 'alice';
    const session = new ChatV2Session({
        getUserId: () => userId, createId: () => uuid,
        invoke: () => new Promise(resolve => { resolveSend = resolve; })
    });
    session.prepare('chat-a', 'Секрет');
    const pending = session.send(uuid);
    await tick();
    session.dispose();
    resolveSend({ data: { chatId: 'chat-a', messageId } });
    const result = await pending;
    assert.equal(result.success, false);
    assert.equal(session.delivery.get(uuid), null);
    await assert.rejects(async () => session.createChat('bob'), /Сессия изменилась/);
    userId = 'bob';
    assert.throws(() => session.prepare('chat-a', 'Нельзя'), /Сессия изменилась/);
    session.dispose();
});

test('stale authenticated identity cannot create trackers or send pending intents', async () => {
    let userId = 'alice', called = 0;
    const session = new ChatV2Session({
        getUserId: () => userId,
        invoke: async () => { called++; return { data: {} }; },
        createId: () => uuid
    });
    session.prepare('chat-a', 'Текст');
    userId = 'bob';
    assert.throws(() => session.send(uuid), /Сессия изменилась/);
    assert.throws(() => session.watchIncoming({
        chatId: 'chat-a', root: { contains: () => true }, isActive: () => true
    }), /Сессия изменилась/);
    assert.equal(called, 0);
    session.dispose();
});


test('v2 session refuses malformed authenticated UID before creating transport', () => {
    for (const userId of ['', ' alice', 'alice ', 'alice/other', 'x'.repeat(129)]) {
        assert.throws(() => new ChatV2Session({
            getUserId: () => userId,
            invoke: async () => ({ data: {} })
        }), /вход в аккаунт/);
    }
});


test('session exposes explicit pending-intent recovery and deliberate discard', async () => {
    const server = fakeServer();
    const session = new ChatV2Session({
        invoke: server.invokeFor('alice'),
        getUserId: () => 'alice',
        createId: () => uuid
    });

    const restored = session.restore('chat-a', 'Recovered after restart', uuid);
    assert.equal(restored.clientMessageId, uuid);
    assert.equal(session.delivery.get(uuid).deliveryStatus, 'checking');
    assert.deepEqual(await session.reconcile(uuid), { status: 'missing' });
    assert.equal(session.delivery.get(uuid).deliveryStatus, 'failed');
    assert.equal(server.calls.filter(item => item.name === 'sendPrivateMessageV2').length, 0);

    assert.equal(session.discard(uuid), true);
    assert.equal(session.delivery.get(uuid), null);
    assert.equal(session.discard(uuid), false);
    session.dispose();
});

test('restore and discard are blocked after account change or disposal', () => {
    let userId = 'alice';
    const session = new ChatV2Session({
        invoke: async () => ({ data: {} }),
        getUserId: () => userId,
        createId: () => uuid
    });
    session.restore('chat-a', 'Private pending text', uuid);
    userId = 'bob';
    assert.throws(() => session.restore('chat-a', 'Other', '650e8400-e29b-41d4-a716-446655440000'),
        /Сессия изменилась/);
    assert.throws(() => session.discard(uuid), /Сессия изменилась/);
    userId = 'alice';
    session.dispose();
    assert.throws(() => session.restore('chat-a', 'Private pending text', uuid),
        /Сессия изменилась/);
    assert.throws(() => session.discard(uuid), /Сессия изменилась/);
});


function securePendingStoreHarness(getUserId, overrides = {}) {
    const records = new Map();
    const adapter = {
        security: { encryptionAtRest: true, integrityProtection: true, accountIsolation: true },
        async read(uid) { return records.get(uid) ?? []; },
        async write(uid, value) {
            if (overrides.write) return overrides.write(uid, value, records);
            records.set(uid, structuredClone(value));
        }
    };
    return {
        store: new ChatPendingIntentStore({ adapter, getUserId, now: () => 1_800_000_000_000 }),
        records,
        adapter
    };
}

test('session persists intent before send and removes it only after confirmed delivery', async () => {
    const server = fakeServer();
    const { store, records } = securePendingStoreHarness(() => 'alice');
    const session = new ChatV2Session({
        invoke: server.invokeFor('alice'), getUserId: () => 'alice',
        createId: () => uuid, pendingStore: store
    });
    session.prepare('chat-a', 'Persist me');
    const result = await session.send(uuid);
    assert.equal(result.success, true);
    assert.deepEqual(records.get('alice'), []);
    assert.equal(server.calls.filter(call => call.name === 'sendPrivateMessageV2').length, 1);
    session.dispose();
});

test('session does not send when secure persistence fails', async () => {
    let sends = 0;
    const store = new ChatPendingIntentStore({
        adapter: {
            security: { encryptionAtRest: true, integrityProtection: true, accountIsolation: true },
            async read() { return []; },
            async write() { throw new Error('disk unavailable'); }
        },
        getUserId: () => 'alice'
    });
    const session = new ChatV2Session({
        invoke: async name => { if (name === 'sendPrivateMessageV2') sends++; return { data: {} }; },
        getUserId: () => 'alice', createId: () => uuid, pendingStore: store
    });
    session.prepare('chat-a', 'Do not send');
    await assert.rejects(session.send(uuid), /disk unavailable/);
    assert.equal(sends, 0);
    session.dispose();
});

test('restorePending reconciles server state before allowing an explicit retry', async () => {
    const server = fakeServer();
    const { store, records } = securePendingStoreHarness(() => 'alice');
    await store.save({ chatId: 'chat-a', text: 'Already delivered', clientMessageId: uuid });
    const session = new ChatV2Session({
        invoke: server.invokeFor('alice'), getUserId: () => 'alice',
        createId: () => uuid, pendingStore: store
    });
    server.messages.set(uuid, { id: messageId, sender: 'alice', read: false });
    const recovered = await session.restorePending();
    assert.deepEqual(recovered, [{ clientMessageId: uuid, status: { status: 'sent', messageId } }]);
    assert.deepEqual(records.get('alice'), []);
    assert.equal(server.calls.filter(call => call.name === 'sendPrivateMessageV2').length, 0);
    session.dispose();
});

test('restorePending keeps missing and unknown records without automatic send', async () => {
    let status = 'missing', sends = 0;
    const { store, records } = securePendingStoreHarness(() => 'alice');
    await store.save({ chatId: 'chat-a', text: 'Retry later', clientMessageId: uuid });
    const session = new ChatV2Session({
        invoke: async name => {
            if (name === 'getPrivateMessageStatusV2') return { data: { status } };
            if (name === 'sendPrivateMessageV2') sends++;
            return { data: {} };
        },
        getUserId: () => 'alice', createId: () => uuid, pendingStore: store
    });
    await session.restorePending();
    assert.equal(sends, 0);
    assert.equal(records.get('alice').length, 1);
    assert.equal(session.delivery.get(uuid).deliveryStatus, 'failed');
    session.dispose();
});

test('account change during pending store read blocks stale restoration', async () => {
    let userId = 'alice', finishRead;
    const store = new ChatPendingIntentStore({
        adapter: {
            security: { encryptionAtRest: true, integrityProtection: true, accountIsolation: true },
            read: () => new Promise(resolve => { finishRead = resolve; }),
            async write() {}
        },
        getUserId: () => userId
    });
    const session = new ChatV2Session({
        invoke: async () => ({ data: { status: 'missing' } }),
        getUserId: () => userId, createId: () => uuid, pendingStore: store
    });
    const restore = session.restorePending();
    await tick();
    userId = 'bob';
    finishRead([{ schemaVersion: 1, userId: 'alice', chatId: 'chat-a', text: 'Private', clientMessageId: uuid, createdAt: Date.now() }]);
    await assert.rejects(restore, /Сессия изменилась/);
    assert.equal(session.delivery.get(uuid), null);
    session.dispose();
});

test('concurrent session sends share one in-flight send and logout clears only its account queue', async () => {
    const server = fakeServer();
    const { store, records } = securePendingStoreHarness(() => 'alice');
    const session = new ChatV2Session({
        invoke: server.invokeFor('alice'), getUserId: () => 'alice',
        createId: () => uuid, pendingStore: store
    });
    session.prepare('chat-a', 'One send');
    const [a, b] = await Promise.all([session.send(uuid), session.send(uuid)]);
    assert.equal(a.success, true);
    assert.equal(b.success, true);
    assert.equal(server.calls.filter(call => call.name === 'sendPrivateMessageV2').length, 1);
    await store.save({ chatId: 'chat-a', text: 'Logout cleanup', clientMessageId: '650e8400-e29b-41d4-a716-446655440000' });
    await session.logout();
    assert.deepEqual(records.get('alice'), []);
    assert.equal(session.disposed, true);
});
