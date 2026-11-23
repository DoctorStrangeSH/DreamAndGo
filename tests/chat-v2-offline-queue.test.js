import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
    createEncryptedChatOutbox,
    flushEncryptedChatOutbox
} from '../js/services/chat-v2-offline-outbox.js';

function createStore() {
    const keys = new Map();
    const messages = new Map();
    return {
        keys,
        messages,
        async getKey(uid) { return keys.get(uid) || null; },
        async putKey(uid, cryptoKey) { keys.set(uid, cryptoKey); },
        async putMessage(record) { messages.set(record.key, structuredClone(record)); },
        async listMessages(uid) {
            return [...messages.values()]
                .filter(record => record.uid === uid)
                .map(record => structuredClone(record));
        },
        async updateMessage(key, patch) {
            const record = messages.get(key);
            if (record) messages.set(key, { ...record, ...patch });
        },
        async deleteMessage(key) { messages.delete(key); }
    };
}

function setup() {
    const store = createStore();
    let timestamp = 1000;
    const outbox = createEncryptedChatOutbox({
        store,
        cryptoApi: webcrypto,
        now: () => timestamp++
    });
    return { store, outbox };
}

test('outbox encrypts message bodies with non-extractable AES-GCM keys', async () => {
    const { store, outbox } = setup();
    const queued = await outbox.enqueue({
        uid: 'alice', chatId: 'chat-1', text: 'секретный текст', messageId: 'message-1'
    });
    const record = store.messages.get('alice:message-1');

    assert.equal(queued.status, 'queued');
    assert.equal(record.status, 'queued');
    assert.equal(record.ciphertext.includes('секретный текст'), false);
    assert.equal(store.keys.get('alice').extractable, false);
    assert.equal(store.keys.get('alice').algorithm.name, 'AES-GCM');

    const [message] = await outbox.list('alice', 'chat-1');
    assert.equal(message.text, 'секретный текст');
    assert.equal(message.senderId, 'alice');
    assert.equal(message.deliveryState, 'queued');
});

test('outbox isolates account keys and queue records', async () => {
    const { store, outbox } = setup();
    await outbox.enqueue({ uid: 'alice', chatId: 'chat-1', text: 'Alice text', messageId: 'same-id' });
    await outbox.enqueue({ uid: 'bob', chatId: 'chat-1', text: 'Bob text', messageId: 'same-id' });

    assert.notEqual(store.keys.get('alice'), store.keys.get('bob'));
    assert.equal((await outbox.list('alice'))[0].text, 'Alice text');
    assert.equal((await outbox.list('bob'))[0].text, 'Bob text');
    assert.equal((await outbox.list('mallory')).length, 0);
});

test('AES-GCM additional data binds ciphertext to account, chat and message ID', async () => {
    const { store, outbox } = setup();
    await outbox.enqueue({ uid: 'alice', chatId: 'chat-1', text: 'bound message', messageId: 'message-1' });
    const original = store.messages.get('alice:message-1');
    store.messages.set('alice:message-1', { ...original, chatId: 'chat-2' });

    await assert.rejects(outbox.list('alice'), /расшифровать/);
    assert.equal(store.messages.has('alice:message-1'), true);
});

test('blocked messages stay encrypted and are excluded from automatic retries', async () => {
    const { store, outbox } = setup();
    await outbox.enqueue({ uid: 'alice', chatId: 'chat-1', text: 'keep me', messageId: 'message-1' });
    await outbox.markBlocked('alice', 'message-1');

    assert.equal((await outbox.getQueued('alice')).length, 0);
    assert.equal((await outbox.list('alice'))[0].deliveryState, 'blocked');
    assert.equal(store.messages.has('alice:message-1'), true);
});

test('clearing one account removes its queue without touching another account', async () => {
    const { store, outbox } = setup();
    await outbox.enqueue({ uid: 'alice', chatId: 'chat-1', text: 'Alice', messageId: 'a1' });
    await outbox.enqueue({ uid: 'bob', chatId: 'chat-2', text: 'Bob', messageId: 'b1' });
    await outbox.clearAccount('alice');

    assert.equal((await outbox.list('alice')).length, 0);
    assert.equal((await outbox.list('bob'))[0].text, 'Bob');
    assert.equal(store.keys.has('alice'), true);
});

test('outbox rejects invalid input and missing cryptographic capabilities', async () => {
    const { outbox } = setup();
    await assert.rejects(outbox.enqueue({
        uid: 'alice', chatId: 'chat-1', text: '   ', messageId: 'message-1'
    }), TypeError);
    assert.throws(() => createEncryptedChatOutbox({
        store: createStore(), cryptoApi: {}
    }), /Web Crypto API/);
});


test('outbox delivery removes confirmed messages and reuses stable client IDs', async () => {
    const { outbox } = setup();
    await outbox.enqueue({ uid: 'alice', chatId: 'chat-1', text: 'first', messageId: 'stable-1' });
    await outbox.enqueue({ uid: 'alice', chatId: 'chat-1', text: 'second', messageId: 'stable-2' });
    const sent = [];
    const result = await flushEncryptedChatOutbox({
        outbox,
        uid: 'alice',
        sendMessage: async payload => {
            sent.push(payload);
            return { success: true, messageId: payload.clientMessageId };
        }
    });

    assert.deepEqual(sent.map(message => message.clientMessageId), ['stable-1', 'stable-2']);
    assert.deepEqual(sent.map(message => message.text), ['first', 'second']);
    assert.deepEqual(result, { sent: 2, blocked: 0, remaining: 0 });
    assert.equal((await outbox.list('alice')).length, 0);
});

test('permission-denied records are retained as blocked while later messages continue', async () => {
    const { outbox } = setup();
    await outbox.enqueue({ uid: 'alice', chatId: 'chat-1', text: 'blocked', messageId: 'blocked-1' });
    await outbox.enqueue({ uid: 'alice', chatId: 'chat-1', text: 'deliver', messageId: 'deliver-1' });
    const result = await flushEncryptedChatOutbox({
        outbox,
        uid: 'alice',
        sendMessage: async payload => {
            if (payload.clientMessageId === 'blocked-1') {
                const error = new Error('blocked');
                error.code = 'functions/permission-denied';
                throw error;
            }
            return { success: true, messageId: payload.clientMessageId };
        }
    });

    assert.deepEqual(result, { sent: 1, blocked: 1, remaining: 0 });
    assert.deepEqual((await outbox.list('alice')).map(message => message.deliveryState), ['blocked']);
});

test('transient delivery failure preserves current and later messages for retry', async () => {
    const { outbox } = setup();
    await outbox.enqueue({ uid: 'alice', chatId: 'chat-1', text: 'first', messageId: 'retry-1' });
    await outbox.enqueue({ uid: 'alice', chatId: 'chat-1', text: 'second', messageId: 'retry-2' });
    let calls = 0;
    const result = await flushEncryptedChatOutbox({
        outbox,
        uid: 'alice',
        sendMessage: async () => {
            calls += 1;
            const error = new Error('network unavailable');
            error.code = 'functions/unavailable';
            throw error;
        }
    });

    assert.equal(calls, 1);
    assert.equal(result.sent, 0);
    assert.equal(result.remaining, 2);
    assert.deepEqual((await outbox.getQueued('alice')).map(record => record.messageId), ['retry-1', 'retry-2']);
});

test('outbox delivery stops immediately when the active account changes', async () => {
    const { outbox } = setup();
    await outbox.enqueue({ uid: 'alice', chatId: 'chat-1', text: 'first', messageId: 'switch-1' });
    await outbox.enqueue({ uid: 'alice', chatId: 'chat-1', text: 'second', messageId: 'switch-2' });
    let active = true;
    let calls = 0;
    const result = await flushEncryptedChatOutbox({
        outbox,
        uid: 'alice',
        isCurrent: () => active,
        sendMessage: async payload => {
            calls += 1;
            active = false;
            return { success: true, messageId: payload.clientMessageId };
        }
    });

    assert.equal(calls, 1);
    assert.equal(result.sent, 1);
    assert.equal(result.remaining, 1);
});
