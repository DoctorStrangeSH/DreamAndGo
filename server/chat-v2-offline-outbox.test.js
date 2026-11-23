import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import {
    createEncryptedChatOutbox,
    createIndexedDbChatOutbox
} from '../js/services/chat-v2-offline-outbox.js';

function createHarness(databaseName = `chat-outbox-test-${randomUUID()}`) {
    const indexedDB = new IDBFactory();
    const create = () => {
        const store = createIndexedDbChatOutbox(indexedDB, { databaseName });
        const outbox = createEncryptedChatOutbox({ store, cryptoApi: webcrypto });
        return { store, outbox };
    };
    return { indexedDB, databaseName, create };
}

test('IndexedDB persists encrypted message bodies and non-extractable keys across service recreation', async () => {
    const harness = createHarness();
    const first = harness.create();
    await first.outbox.enqueue({
        uid: 'alice', chatId: 'chat-1', text: 'survives service recreation', messageId: 'persistent-1'
    });

    const rawRecords = await first.store.listMessages('alice');
    assert.equal(rawRecords.length, 1);
    assert.equal(rawRecords[0].ciphertext.includes('survives service recreation'), false);
    assert.equal(rawRecords[0].status, 'queued');

    const restarted = harness.create();
    const [message] = await restarted.outbox.list('alice', 'chat-1');
    assert.equal(message.text, 'survives service recreation');
    assert.equal(message.id, 'persistent-1');
    assert.equal(message.deliveryState, 'queued');
    assert.equal((await restarted.store.getKey('alice')).extractable, false);
});

test('IndexedDB isolates persisted queues and encryption keys by account', async () => {
    const harness = createHarness();
    const { outbox } = harness.create();
    await Promise.all([
        outbox.enqueue({ uid: 'alice', chatId: 'chat-1', text: 'Alice only', messageId: 'same-id' }),
        outbox.enqueue({ uid: 'bob', chatId: 'chat-1', text: 'Bob only', messageId: 'same-id' })
    ]);

    const restarted = harness.create();
    assert.equal((await restarted.outbox.list('alice'))[0].text, 'Alice only');
    assert.equal((await restarted.outbox.list('bob'))[0].text, 'Bob only');
    assert.equal((await restarted.outbox.list('mallory')).length, 0);
    assert.notDeepEqual(
        await restarted.store.getKey('alice'),
        await restarted.store.getKey('bob')
    );
});

test('concurrent tabs converge on one persisted account key without corrupting either queue write', async () => {
    const harness = createHarness();
    const tabA = harness.create();
    const tabB = harness.create();

    await Promise.all([
        tabA.outbox.enqueue({ uid: 'alice', chatId: 'chat-1', text: 'from tab A', messageId: 'tab-a' }),
        tabB.outbox.enqueue({ uid: 'alice', chatId: 'chat-1', text: 'from tab B', messageId: 'tab-b' })
    ]);

    const restarted = harness.create();
    const messages = await restarted.outbox.list('alice');
    assert.deepEqual(messages.map(message => message.text).sort(), ['from tab A', 'from tab B']);
    assert.equal((await restarted.store.listMessages('alice')).length, 2);
});

test('IndexedDB keeps blocked messages encrypted and removes only the requested account queue', async () => {
    const harness = createHarness();
    const { outbox } = harness.create();
    await outbox.enqueue({ uid: 'alice', chatId: 'chat-1', text: 'blocked locally', messageId: 'blocked-1' });
    await outbox.enqueue({ uid: 'bob', chatId: 'chat-2', text: 'keep bob', messageId: 'bob-1' });
    await outbox.markBlocked('alice', 'blocked-1');

    const restarted = harness.create();
    assert.equal((await restarted.outbox.list('alice'))[0].deliveryState, 'blocked');
    await restarted.outbox.clearAccount('alice');
    assert.equal((await restarted.outbox.list('alice')).length, 0);
    assert.equal((await restarted.outbox.list('bob'))[0].text, 'keep bob');
});
