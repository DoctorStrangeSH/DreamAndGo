const DATABASE_VERSION = 1;
const RECORDS_STORE = 'encryptedPending';
const KEYS_STORE = 'pendingKeys';
const ENVELOPE_VERSION = 1;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function assertUid(userId) {
    if (typeof userId !== 'string' || !userId || userId.length > 128 ||
        userId.trim() !== userId || userId.includes('/')) {
        throw new TypeError('Некорректный владелец очереди');
    }
}

function requestValue(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Ошибка локального хранилища'));
    });
}

function transactionFinished(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error || new Error('Операция хранилища отменена'));
        transaction.onerror = () => reject(transaction.error || new Error('Ошибка локального хранилища'));
    });
}

function openDatabase(indexedDB, name) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, DATABASE_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(RECORDS_STORE)) {
                db.createObjectStore(RECORDS_STORE, { keyPath: 'userId' });
            }
            if (!db.objectStoreNames.contains(KEYS_STORE)) {
                db.createObjectStore(KEYS_STORE, { keyPath: 'userId' });
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => db.close();
            resolve(db);
        };
        request.onerror = () => reject(request.error || new Error('Не удалось открыть локальное хранилище'));
        request.onblocked = () => reject(new Error('Локальное хранилище занято другой вкладкой'));
    });
}

export async function encryptChatPendingRecords(records, userId, key, cryptoImpl = globalThis.crypto) {
    assertUid(userId);
    if (!Array.isArray(records) || !key || !cryptoImpl?.subtle) {
        throw new TypeError('Некорректные параметры шифрования очереди');
    }
    const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
    const additionalData = encoder.encode('dream-and-go:chat-pending:v1:' + userId);
    const plaintext = encoder.encode(JSON.stringify(records));
    const ciphertext = await cryptoImpl.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData, tagLength: 128 }, key, plaintext
    );
    return Object.freeze({
        version: ENVELOPE_VERSION,
        iv: new Uint8Array(iv),
        ciphertext: new Uint8Array(ciphertext)
    });
}

export async function decryptChatPendingRecords(envelope, userId, key, cryptoImpl = globalThis.crypto) {
    assertUid(userId);
    if (!envelope || envelope.version !== ENVELOPE_VERSION ||
        !(envelope.iv instanceof Uint8Array) || envelope.iv.byteLength !== 12 ||
        !(envelope.ciphertext instanceof Uint8Array) || envelope.ciphertext.byteLength < 16 ||
        !key || !cryptoImpl?.subtle) {
        throw new TypeError('Повреждённая зашифрованная очередь');
    }
    const additionalData = encoder.encode('dream-and-go:chat-pending:v1:' + userId);
    try {
        const plaintext = await cryptoImpl.subtle.decrypt(
            { name: 'AES-GCM', iv: envelope.iv, additionalData, tagLength: 128 },
            key, envelope.ciphertext
        );
        const records = JSON.parse(decoder.decode(plaintext));
        if (!Array.isArray(records)) throw new Error('Invalid payload');
        return records;
    } catch {
        throw new Error('Не удалось проверить целостность зашифрованной очереди');
    }
}

// Browser adapter for ChatPendingIntentStore. AES-256-GCM authenticates both
// ciphertext and account-bound AAD. The non-extractable CryptoKey is stored by
// IndexedDB as a structured-clone CryptoKey, never as exported key bytes.
// This protects persisted queue contents from plaintext-at-rest exposure; it
// does not protect against XSS or code already executing in the same origin.
export function createEncryptedChatPendingAdapter({
    indexedDB = globalThis.indexedDB,
    crypto: cryptoImpl = globalThis.crypto,
    databaseName = 'dream-and-go-private-chat'
} = {}) {
    if (!indexedDB || typeof indexedDB.open !== 'function' ||
        !cryptoImpl?.subtle || typeof cryptoImpl.getRandomValues !== 'function' ||
        typeof databaseName !== 'string' || !databaseName.trim()) {
        throw new TypeError('Требуется IndexedDB и Web Crypto');
    }

    let databasePromise;
    const database = () => databasePromise ||= openDatabase(indexedDB, databaseName);

    async function getOrCreateKey(db, userId) {
        const read = db.transaction(KEYS_STORE, 'readonly');
        const readDone = transactionFinished(read);
        const existing = await requestValue(read.objectStore(KEYS_STORE).get(userId));
        await readDone;
        if (existing?.key) {
            if (!isExpectedKey(existing.key)) throw new Error('Некорректный ключ очереди');
            return existing.key;
        }

        const generated = await cryptoImpl.subtle.generateKey(
            { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
        );
        const write = db.transaction(KEYS_STORE, 'readwrite');
        const writeDone = transactionFinished(write);
        const store = write.objectStore(KEYS_STORE);
        const lookup = store.get(userId);
        const chosen = await new Promise((resolve, reject) => {
            lookup.onsuccess = () => {
                const current = lookup.result;
                if (current?.key) {
                    if (!isExpectedKey(current.key)) {
                        reject(new Error('Некорректный ключ очереди'));
                        return;
                    }
                    resolve(current.key);
                    return;
                }
                const add = store.put({ userId, key: generated });
                add.onsuccess = () => resolve(generated);
                add.onerror = () => reject(add.error || new Error('Не удалось сохранить ключ очереди'));
            };
            lookup.onerror = () => reject(lookup.error || new Error('Не удалось прочитать ключ очереди'));
        });
        await writeDone;
        return chosen;
    }

    async function getStoredKey(db, userId) {
        const tx = db.transaction(KEYS_STORE, 'readonly');
        const done = transactionFinished(tx);
        const record = await requestValue(tx.objectStore(KEYS_STORE).get(userId));
        await done;
        if (record?.userId !== userId || !isExpectedKey(record.key)) {
            throw new Error('Не удалось проверить ключ зашифрованной очереди');
        }
        return record.key;
    }

    return Object.freeze({
        security: Object.freeze({
            encryptionAtRest: true,
            integrityProtection: true,
            accountIsolation: true
        }),

        async read(userId) {
            assertUid(userId);
            const db = await database();
            const tx = db.transaction(RECORDS_STORE, 'readonly');
            const done = transactionFinished(tx);
            const record = await requestValue(tx.objectStore(RECORDS_STORE).get(userId));
            await done;
            if (!record) return [];
            const key = await getStoredKey(db, userId);
            return decryptChatPendingRecords(record.envelope, userId, key, cryptoImpl);
        },

        async write(userId, records) {
            assertUid(userId);
            if (!Array.isArray(records)) throw new TypeError('Некорректная очередь сообщений');
            const db = await database();
            if (records.length === 0) {
                const tx = db.transaction([RECORDS_STORE, KEYS_STORE], 'readwrite');
                tx.objectStore(RECORDS_STORE).delete(userId);
                tx.objectStore(KEYS_STORE).delete(userId);
                await transactionFinished(tx);
                return;
            }
            const key = await getOrCreateKey(db, userId);
            const envelope = await encryptChatPendingRecords(records, userId, key, cryptoImpl);
            const tx = db.transaction(RECORDS_STORE, 'readwrite');
            tx.objectStore(RECORDS_STORE).put({ userId, envelope });
            await transactionFinished(tx);
        },

        async close() {
            if (!databasePromise) return;
            const db = await databasePromise;
            db.close();
            databasePromise = null;
        }
    });
}
