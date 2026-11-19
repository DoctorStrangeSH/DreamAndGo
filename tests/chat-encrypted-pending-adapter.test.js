import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
    createEncryptedChatPendingAdapter,
    encryptChatPendingRecords,
    decryptChatPendingRecords
} from '../js/core/chat-encrypted-pending-adapter.js';

const records = [{
    schemaVersion: 1,
    userId: 'alice',
    chatId: 'chat-a',
    text: 'Private message',
    clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
    createdAt: 1_800_000_000_000
}];

test('AES-GCM pending envelope round-trips records with a non-extractable key', async () => {
    const key = await webcrypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
    assert.equal(key.extractable, false);
    const envelope = await encryptChatPendingRecords(records, 'alice', key, webcrypto);
    assert.notEqual(Buffer.from(envelope.ciphertext).toString('utf8'), JSON.stringify(records));
    assert.deepEqual(await decryptChatPendingRecords(envelope, 'alice', key, webcrypto), records);
});

test('AES-GCM authentication rejects ciphertext tampering', async () => {
    const key = await webcrypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
    const envelope = await encryptChatPendingRecords(records, 'alice', key, webcrypto);
    const tampered = {
        ...envelope,
        ciphertext: new Uint8Array(envelope.ciphertext)
    };
    tampered.ciphertext[0] ^= 0x01;
    await assert.rejects(
        decryptChatPendingRecords(tampered, 'alice', key, webcrypto),
        /целостность/
    );
});

test('AES-GCM additional authenticated data prevents cross-account replay', async () => {
    const key = await webcrypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
    const envelope = await encryptChatPendingRecords(records, 'alice', key, webcrypto);
    await assert.rejects(
        decryptChatPendingRecords(envelope, 'bob', key, webcrypto),
        /целостность/
    );
});

test('encrypted adapter refuses environments without IndexedDB or Web Crypto', () => {
    assert.throws(() => createEncryptedChatPendingAdapter({
        indexedDB: null, crypto: webcrypto
    }), /IndexedDB/);
    assert.throws(() => createEncryptedChatPendingAdapter({
        indexedDB: { open() {} }, crypto: null
    }), /IndexedDB и Web Crypto/);
});
