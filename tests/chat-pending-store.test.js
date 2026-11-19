import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatPendingIntentStore, CHAT_PENDING_STORE_SCHEMA_VERSION } from '../js/core/chat-pending-store.js';

const uuid = '550e8400-e29b-41d4-a716-446655440000';

function harness() {
    let userId = 'alice';
    const data = new Map();
    const writes = [];
    const adapter = {
        security: { encryptionAtRest: true, integrityProtection: true, accountIsolation: true },
        async read(uid) { return data.get(uid) ?? []; },
        async write(uid, records) {
            writes.push(uid);
            data.set(uid, structuredClone(records));
        }
    };
    const store = new ChatPendingIntentStore({
        adapter, getUserId: () => userId, now: () => 1_800_000_000_000
    });
    return { store, adapter, data, writes, setUser: value => { userId = value; } };
}

test('pending store persists only versioned, account-scoped normalized intents', async () => {
    const h = harness();
    const saved = await h.store.save({ chatId: 'chat-a', text: 'Hello', clientMessageId: uuid.toUpperCase() });
    assert.deepEqual(saved, {
        schemaVersion: CHAT_PENDING_STORE_SCHEMA_VERSION,
        userId: 'alice', chatId: 'chat-a', text: 'Hello',
        clientMessageId: uuid, createdAt: 1_800_000_000_000
    });
    assert.deepEqual(await h.store.load(), [saved]);
    assert.deepEqual(await h.adapter.read('bob'), []);
});

test('pending store rejects malformed intents and conflicting UUID reuse', async () => {
    const h = harness();
    await assert.rejects(h.store.save({ chatId: 'chat/a', text: 'Hello', clientMessageId: uuid }), TypeError);
    await assert.rejects(h.store.save({ chatId: 'chat-a', text: '  ', clientMessageId: uuid }), TypeError);
    await h.store.save({ chatId: 'chat-a', text: 'Hello', clientMessageId: uuid });
    await assert.rejects(h.store.save({ chatId: 'chat-b', text: 'Different', clientMessageId: uuid }), /другому сообщению/);
});

test('load drops corrupt, foreign, duplicate, future and expired records', async () => {
    const h = harness();
    const now = 1_800_000_000_000;
    h.data.set('alice', [
        { schemaVersion: 1, userId: 'alice', chatId: 'chat-a', text: 'Keep', clientMessageId: uuid, createdAt: now },
        { schemaVersion: 99, userId: 'alice', chatId: 'chat-a', text: 'Old schema', clientMessageId: '650e8400-e29b-41d4-a716-446655440000', createdAt: now },
        { schemaVersion: 1, userId: 'bob', chatId: 'chat-a', text: 'Foreign', clientMessageId: '750e8400-e29b-41d4-a716-446655440000', createdAt: now },
        { schemaVersion: 1, userId: 'alice', chatId: 'chat-a', text: 'Expired', clientMessageId: '850e8400-e29b-41d4-a716-446655440000', createdAt: now - 8 * 24 * 60 * 60 * 1000 },
        { schemaVersion: 1, userId: 'alice', chatId: 'chat-a', text: 'Future', clientMessageId: '950e8400-e29b-41d4-a716-446655440000', createdAt: now + 1 },
        { schemaVersion: 1, userId: 'alice', chatId: 'chat-a', text: 'Duplicate', clientMessageId: uuid, createdAt: now }
    ]);
    const loaded = await h.store.load();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].text, 'Keep');
    assert.equal((await h.adapter.read('alice')).length, 1);
});

test('pending store refuses reads and writes after account switch', async () => {
    const h = harness();
    await h.store.save({ chatId: 'chat-a', text: 'Private', clientMessageId: uuid });
    h.setUser('bob');
    await assert.rejects(h.store.load(), /Сессия изменилась/);
    await assert.rejects(h.store.save({ chatId: 'chat-a', text: 'Leak', clientMessageId: '650e8400-e29b-41d4-a716-446655440000' }), /Сессия изменилась/);
    await assert.rejects(h.store.remove(uuid), /Сессия изменилась/);
    await assert.rejects(h.store.clear(), /Сессия изменилась/);
    assert.equal((await h.adapter.read('alice')).length, 1);
    assert.deepEqual(await h.adapter.read('bob'), []);
});

test('remove and clear affect only the active account namespace', async () => {
    const h = harness();
    await h.store.save({ chatId: 'chat-a', text: 'One', clientMessageId: uuid });
    assert.equal(await h.store.remove(uuid.toUpperCase()), true);
    assert.equal(await h.store.remove(uuid), false);
    await h.store.save({ chatId: 'chat-a', text: 'Two', clientMessageId: uuid });
    await h.store.clear();
    assert.deepEqual(await h.store.load(), []);
});

test('pending store requires an explicit adapter and authenticated UID', () => {
    assert.throws(() => new ChatPendingIntentStore({ adapter: {}, getUserId: () => 'alice' }), TypeError);
    assert.throws(() => new ChatPendingIntentStore({
        adapter: { read() {}, write() {}, security: { encryptionAtRest: true } },
        getUserId: () => 'alice'
    }), TypeError);
    assert.throws(() => new ChatPendingIntentStore({
        adapter: { security: { encryptionAtRest: true, integrityProtection: true, accountIsolation: true }, read() {}, write() {} }, getUserId: () => 'bad/user'
    }), /вход в аккаунт/);
});
