const DATABASE_NAME = 'dreamandgo-chat-outbox';
const DATABASE_VERSION = 1;
const QUEUE_STORE = 'messages';
const KEY_STORE = 'keys';
const MAX_MESSAGE_LENGTH = 4000;

function requireText(value, field, maxLength) {
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
        throw new TypeError(`Некорректное поле: ${field}`);
    }
    return value.trim();
}

function encodeBase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function decodeBase64(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Ошибка локального хранилища.'));
    });
}

function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onabort = () => reject(transaction.error || new Error('Транзакция хранилища прервана.'));
        transaction.onerror = () => reject(transaction.error || new Error('Ошибка транзакции хранилища.'));
    });
}

export function createIndexedDbChatOutbox(
    indexedDBApi = globalThis.indexedDB,
    { databaseName = DATABASE_NAME } = {}
) {
    if (!indexedDBApi?.open) throw new Error('IndexedDB недоступен в этом браузере.');

    let databasePromise;
    const database = () => {
        if (!databasePromise) {
            databasePromise = new Promise((resolve, reject) => {
                const request = indexedDBApi.open(databaseName, DATABASE_VERSION);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains(QUEUE_STORE)) {
                        const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'key' });
                        store.createIndex('byUid', 'uid', { unique: false });
                    }
                    if (!db.objectStoreNames.contains(KEY_STORE)) {
                        db.createObjectStore(KEY_STORE, { keyPath: 'uid' });
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error('Не удалось открыть локальную очередь.'));
                request.onblocked = () => reject(new Error('Локальная очередь занята другой вкладкой.'));
            }).catch(error => {
                databasePromise = null;
                throw error;
            });
        }
        return databasePromise;
    };

    return {
        async getKey(uid) {
            const db = await database();
            const tx = db.transaction(KEY_STORE, 'readonly');
            const done = transactionDone(tx);
            const record = await requestResult(tx.objectStore(KEY_STORE).get(uid));
            await done;
            return record?.cryptoKey || null;
        },
        async putKey(uid, cryptoKey) {
            try {
                const db = await database();
                const tx = db.transaction(KEY_STORE, 'readwrite');
                const done = transactionDone(tx);
                const request = tx.objectStore(KEY_STORE).add({ uid, cryptoKey });
                await Promise.all([requestResult(request), done]);
                return cryptoKey;
            } catch (error) {
                // Another tab may have created the account key first. Never overwrite it:
                // existing queue records may already have been encrypted with that key.
                const existing = await this.getKey(uid);
                if (existing) return existing;
                throw error;
            }
        },
        async putMessage(record) {
            const db = await database();
            const tx = db.transaction(QUEUE_STORE, 'readwrite');
            const done = transactionDone(tx);
            tx.objectStore(QUEUE_STORE).put(record);
            await done;
        },
        async listMessages(uid) {
            const db = await database();
            const tx = db.transaction(QUEUE_STORE, 'readonly');
            const done = transactionDone(tx);
            const records = await requestResult(tx.objectStore(QUEUE_STORE).index('byUid').getAll(uid));
            await done;
            return records;
        },
        async updateMessage(key, patch) {
            const db = await database();
            const tx = db.transaction(QUEUE_STORE, 'readwrite');
            const done = transactionDone(tx);
            const store = tx.objectStore(QUEUE_STORE);
            const record = await requestResult(store.get(key));
            if (record) store.put({ ...record, ...patch });
            await done;
        },
        async deleteMessage(key) {
            const db = await database();
            const tx = db.transaction(QUEUE_STORE, 'readwrite');
            const done = transactionDone(tx);
            tx.objectStore(QUEUE_STORE).delete(key);
            await done;
        }
    };
}

export function createEncryptedChatOutbox({
    store,
    cryptoApi = globalThis.crypto,
    now = () => Date.now()
} = {}) {
    if (!store || typeof store.getKey !== 'function' ||
        typeof store.putKey !== 'function' || typeof store.putMessage !== 'function' ||
        typeof store.listMessages !== 'function' || typeof store.deleteMessage !== 'function' ||
        typeof store.updateMessage !== 'function') {
        throw new TypeError('Не настроено хранилище офлайн-очереди.');
    }
    if (!cryptoApi?.subtle || !cryptoApi?.getRandomValues) {
        throw new Error('Web Crypto API недоступен. Сообщения не будут сохранены без шифрования.');
    }

    const keyFor = async uid => {
        let key = await store.getKey(uid);
        if (key) return key;
        key = await cryptoApi.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        const storedKey = await store.putKey(uid, key);
        return storedKey || await store.getKey(uid) || key;
    };

    const additionalData = (uid, chatId, messageId) =>
        new TextEncoder().encode(JSON.stringify([uid, chatId, messageId]));

    return Object.freeze({
        async enqueue({ uid, chatId, text, messageId }) {
            uid = requireText(uid, 'uid', 128);
            chatId = requireText(chatId, 'chatId', 128);
            text = requireText(text, 'text', MAX_MESSAGE_LENGTH);
            messageId = requireText(messageId, 'messageId', 128);
            const key = await keyFor(uid);
            const iv = cryptoApi.getRandomValues(new Uint8Array(12));
            const plaintext = new TextEncoder().encode(text);
            const ciphertext = await cryptoApi.subtle.encrypt({
                name: 'AES-GCM',
                iv,
                additionalData: additionalData(uid, chatId, messageId),
                tagLength: 128
            }, key, plaintext);
            const record = {
                key: `${uid}:${messageId}`,
                uid,
                chatId,
                messageId,
                iv: encodeBase64(iv),
                ciphertext: encodeBase64(new Uint8Array(ciphertext)),
                status: 'queued',
                createdAt: now(),
                attempts: 0
            };
            await store.putMessage(record);
            return { messageId, chatId, createdAt: record.createdAt, status: record.status };
        },

        async list(uid, chatId = null) {
            uid = requireText(uid, 'uid', 128);
            const records = await store.listMessages(uid);
            const visible = records
                .filter(record => !chatId || record.chatId === chatId)
                .sort((left, right) => left.createdAt - right.createdAt);
            const key = visible.length ? await keyFor(uid) : null;
            const messages = [];
            for (const record of visible) {
                try {
                    const plaintext = await cryptoApi.subtle.decrypt({
                        name: 'AES-GCM',
                        iv: decodeBase64(record.iv),
                        additionalData: additionalData(uid, record.chatId, record.messageId),
                        tagLength: 128
                    }, key, decodeBase64(record.ciphertext));
                    messages.push({
                        id: record.messageId,
                        chatId: record.chatId,
                        senderId: uid,
                        text: new TextDecoder().decode(plaintext),
                        createdAt: new Date(record.createdAt),
                        read: false,
                        edited: false,
                        deliveryState: record.status,
                        attempts: record.attempts
                    });
                } catch {
                    throw new Error('Не удалось расшифровать локальное сообщение. Запись сохранена без изменений.');
                }
            }
            return messages;
        },

        async getQueued(uid) {
            uid = requireText(uid, 'uid', 128);
            return (await store.listMessages(uid))
                .filter(record => record.status === 'queued')
                .sort((left, right) => left.createdAt - right.createdAt);
        },

        async markBlocked(uid, messageId) {
            await store.updateMessage(`${uid}:${messageId}`, {
                status: 'blocked',
                lastError: 'permission-denied'
            });
        },

        async remove(uid, messageId) {
            await store.deleteMessage(`${uid}:${messageId}`);
        },

        async clearAccount(uid) {
            uid = requireText(uid, 'uid', 128);
            const records = await store.listMessages(uid);
            await Promise.all(records.map(record => store.deleteMessage(record.key)));
        }
    });
}


export async function flushEncryptedChatOutbox({
    outbox,
    uid,
    sendMessage,
    isOnline = () => true,
    isCurrent = () => true,
    onChange = () => {}
}) {
    if (!outbox || typeof sendMessage !== 'function') {
        throw new TypeError('Не настроена отправка офлайн-сообщений.');
    }
    const records = await outbox.getQueued(uid);
    const pending = await outbox.list(uid);
    const textById = new Map(pending.map(message => [message.id, message.text]));
    const result = { sent: 0, blocked: 0, remaining: records.length };

    for (const record of records) {
        if (!isCurrent() || !isOnline()) break;
        try {
            const text = textById.get(record.messageId);
            if (typeof text !== 'string') throw new Error('Локальное сообщение не найдено.');
            const response = await sendMessage({
                chatId: record.chatId,
                text,
                clientMessageId: record.messageId
            });
            if (response?.success !== true || typeof response.messageId !== 'string') {
                throw new Error('Сервер не подтвердил отправку сообщения.');
            }
            await outbox.remove(uid, record.messageId);
            result.sent += 1;
            result.remaining -= 1;
            onChange();
        } catch (error) {
            if (String(error?.code || '').endsWith('permission-denied')) {
                await outbox.markBlocked(uid, record.messageId);
                result.blocked += 1;
                result.remaining -= 1;
                onChange();
                continue;
            }
            result.error = error;
            break;
        }
    }
    return result;
}
