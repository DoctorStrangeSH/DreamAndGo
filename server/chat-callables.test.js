import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatCallables, privateChatId } from './chat-callables.js';

class TestHttpsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function createHarness(seed = {}) {
    const records = new Map(Object.entries(seed));
    const registrations = [];
    let nextId = 0;
    const timestamp = { toMillis: () => 1700000000000 };
    const snapshot = (path) => {
        const value = records.get(path);
        return {
            id: path.split('/').at(-1),
            ref: documentRef(path),
            exists: value !== undefined,
            data: () => value
        };
    };
    const documentRef = path => ({
        path,
        id: path.split('/').at(-1),
        collection(name) {
            return collectionRef(`${path}/${name}`);
        },
        async get() { return snapshot(path); }
    });
    const collectionRef = path => ({
        path,
        doc(id) {
            const documentId = id || `auto-${++nextId}`;
            return documentRef(`${path}/${documentId}`);
        },
        orderBy(field, direction = 'asc') {
            return {
                limit(count) {
                    return {
                        async get() {
                            const docs = [...records.entries()]
                                .filter(([key]) => key.startsWith(`${path}/`) &&
                                    !key.slice(path.length + 1).includes('/'))
                                .sort((a, b) => {
                                    const av = a[1][field]?.toMillis?.() || 0;
                                    const bv = b[1][field]?.toMillis?.() || 0;
                                    return direction === 'desc' ? bv - av : av - bv;
                                })
                                .slice(0, count)
                                .map(([key]) => snapshot(key));
                            return { docs, empty: docs.length === 0, size: docs.length };
                        }
                    };
                }
            };
        }
    });
    const db = {
        collection: collectionRef,
        async runTransaction(callback) {
            const pending = [];
            const transaction = {
                async get(ref) { return snapshot(ref.path); },
                create(ref, data) { pending.push({ type: 'create', path: ref.path, data }); },
                set(ref, data, options = {}) { pending.push({ type: 'set', path: ref.path, data, merge: options.merge }); },
                update(ref, data) { pending.push({ type: 'update', path: ref.path, data }); },
                delete(ref) { pending.push({ type: 'delete', path: ref.path }); }
            };
            const result = await callback(transaction);
            for (const op of pending) {
                if (op.type === 'create') {
                    if (records.has(op.path)) throw new Error('already exists');
                    records.set(op.path, op.data);
                } else if (op.type === 'set') {
                    records.set(op.path, op.merge
                        ? { ...(records.get(op.path) || {}), ...op.data }
                        : op.data);
                } else if (op.type === 'update') {
                    if (!records.has(op.path)) throw new Error('missing document');
                    records.set(op.path, { ...records.get(op.path), ...op.data });
                } else if (op.type === 'delete') {
                    records.delete(op.path);
                }
            }
            return result;
        }
    };
    const callables = createChatCallables({
        onCall(options, handler) {
            registrations.push({ options, handler });
            return handler;
        },
        HttpsError: TestHttpsError,
        getFirestore: () => db,
        FieldValue: {
            serverTimestamp: () => timestamp,
            increment: amount => ({ increment: amount })
        }
    });
    return { records, registrations, callables };
}

function friendSeed() {
    return {
        'users/alice': { username: 'alice' },
        'users/bob': { username: 'bob' },
        'users/alice/friends/bob': { friendId: 'bob' },
        'users/bob/friends/alice': { friendId: 'alice' }
    };
}

async function createChat(ctx, actor = 'alice', target = 'bob') {
    return ctx.callables.createPrivateChatV2({
        auth: { uid: actor }, data: { targetUid: target }
    });
}

test('all Chat V2 callables enforce App Check in the selected region', () => {
    const ctx = createHarness();
    assert.equal(ctx.registrations.length, 8);
    for (const registration of ctx.registrations) {
        assert.deepEqual(registration.options, { region: 'europe-west3', enforceAppCheck: true });
    }
});

test('private chat IDs are stable and collision-resistant for UID pairs', () => {
    assert.equal(privateChatId('alice', 'bob'), privateChatId('bob', 'alice'));
    assert.notEqual(privateChatId('a_b', 'c'), privateChatId('a', 'b_c'));
});

test('only authenticated friends can create a canonical private chat', async () => {
    const ctx = createHarness(friendSeed());
    const result = await createChat(ctx);
    assert.equal(result.success, true);
    assert.equal(result.chatId, privateChatId('alice', 'bob'));
    const chat = ctx.records.get(`chats/${result.chatId}`);
    assert.deepEqual(chat.participants, ['alice', 'bob']);
    assert.equal(chat.type, 'private');
    assert.equal(chat.schemaVersion, 2);
    assert.equal(ctx.records.get(`users/alice/chats/${result.chatId}`).partnerId, 'bob');
    assert.equal(ctx.records.get(`users/bob/chats/${result.chatId}`).partnerId, 'alice');
});

test('chat creation rejects self-chat and users who are not reciprocal friends', async () => {
    const ctx = createHarness({ 'users/alice': {}, 'users/bob': {} });
    await assert.rejects(createChat(ctx, 'alice', 'alice'), error => error.code === 'invalid-argument');
    await assert.rejects(createChat(ctx), error => error.code === 'permission-denied');
});

test('message send derives sender and recipient from authenticated membership', async () => {
    const ctx = createHarness(friendSeed());
    const { chatId } = await createChat(ctx);
    const result = await ctx.callables.sendPrivateMessageV2({
        auth: { uid: 'alice' }, data: { chatId, text: 'Привет, Боб!', clientMessageId: 'test-message-1' }
    });
    assert.equal(result.success, true);
    const message = ctx.records.get(`chats/${chatId}/messages/${result.messageId}`);
    assert.equal(message.senderId, 'alice');
    assert.equal(message.text, 'Привет, Боб!');
    assert.equal(ctx.records.get(`users/bob/chats/${chatId}`).unread, 1);
    const notification = ctx.records.get(`users/bob/notifications/auto-2`);
    assert.equal(notification.type, 'new_message');
    assert.equal(notification.fromUserId, 'alice');
    assert.equal(notification.message.includes('Привет, Боб!'), false);
});

test('chat contacts are derived from the authenticated user friend list', async () => {
    const seed = {
        ...friendSeed(),
        'publicProfiles/bob': { username: 'bob', displayName: 'Bob', avatar: 'https://example.test/bob.png' }
    };
    const ctx = createHarness(seed);
    const result = await ctx.callables.getMyChatContactsV2({
        auth: { uid: 'alice' }, data: {}
    });
    assert.deepEqual(result.contacts, [{
        uid: 'bob', username: 'bob', displayName: 'Bob',
        avatar: 'https://example.test/bob.png'
    }]);
    assert.deepEqual(await ctx.callables.getMyChatContactsV2({
        auth: { uid: 'mallory' }, data: {}
    }), { contacts: [] });
});

test('private inbox returns only canonical chats owned by the authenticated user', async () => {
    const ctx = createHarness(friendSeed());
    const { chatId } = await createChat(ctx);
    const result = await ctx.callables.getMyPrivateChatsV2({
        auth: { uid: 'alice' }, data: {}
    });
    assert.equal(result.chats.length, 1);
    assert.equal(result.chats[0].chatId, chatId);
    assert.equal(result.chats[0].partnerId, 'bob');
    assert.equal(result.chats[0].partnerName, 'Пользователь');
    const outsider = await ctx.callables.getMyPrivateChatsV2({
        auth: { uid: 'mallory' }, data: {}
    });
    assert.deepEqual(outsider, { chats: [] });
});

test('outsiders cannot send messages or read private history', async () => {
    const ctx = createHarness(friendSeed());
    const { chatId } = await createChat(ctx);
    await assert.rejects(ctx.callables.sendPrivateMessageV2({
        auth: { uid: 'mallory' }, data: { chatId, text: 'intrusion', clientMessageId: 'test-message-2' }
    }), error => error.code === 'permission-denied');
    await assert.rejects(ctx.callables.getPrivateChatHistoryV2({
        auth: { uid: 'mallory' }, data: { chatId }
    }), error => error.code === 'permission-denied');
});

test('history returns only an allowlisted message projection', async () => {
    const ctx = createHarness(friendSeed());
    const { chatId } = await createChat(ctx);
    const sent = await ctx.callables.sendPrivateMessageV2({
        auth: { uid: 'alice' }, data: { chatId, text: 'private text', clientMessageId: 'test-message-3' }
    });
    ctx.records.set(`chats/${chatId}/messages/${sent.messageId}`, {
        ...ctx.records.get(`chats/${chatId}/messages/${sent.messageId}`),
        secretInternalField: 'must-not-leak'
    });
    const result = await ctx.callables.getPrivateChatHistoryV2({
        auth: { uid: 'bob' }, data: { chatId }
    });
    assert.equal(result.messages.length, 1);
    assert.deepEqual(Object.keys(result.messages[0]).sort(),
        ['createdAt', 'edited', 'editedAt', 'id', 'read', 'readAt', 'senderId', 'text'].sort());
    assert.equal(result.messages[0].text, 'private text');
});

test('read receipt status is visible only to chat participants', async () => {
    const ctx = createHarness(friendSeed());
    const { chatId } = await createChat(ctx);
    const sent = await ctx.callables.sendPrivateMessageV2({
        auth: { uid: 'alice' }, data: { chatId, text: 'receipt check', clientMessageId: 'test-message-4' }
    });
    assert.deepEqual(await ctx.callables.getPrivateMessageStatusV2({
        auth: { uid: 'bob' }, data: { chatId, messageId: sent.messageId }
    }), { senderId: 'alice', read: false, readAt: null });
    await assert.rejects(ctx.callables.getPrivateMessageStatusV2({
        auth: { uid: 'mallory' }, data: { chatId, messageId: sent.messageId }
    }), error => error.code === 'permission-denied');
});

test('opening the same private chat is idempotent and does not reset unread state', async () => {
    const ctx = createHarness(friendSeed());
    const first = await createChat(ctx);
    ctx.records.set(`users/alice/chats/${first.chatId}`, {
        ...ctx.records.get(`users/alice/chats/${first.chatId}`), unread: 2
    });
    const second = await createChat(ctx, 'bob', 'alice');
    assert.equal(second.chatId, first.chatId);
    assert.equal(ctx.records.get(`users/alice/chats/${first.chatId}`).unread, 2);
    assert.equal([...ctx.records.keys()].filter(path => path === `chats/${first.chatId}`).length, 1);
});

test('retries with the same client message ID do not duplicate messages or unread counts', async () => {
    const ctx = createHarness(friendSeed());
    const { chatId } = await createChat(ctx);
    const payload = {
        auth: { uid: 'alice' },
        data: { chatId, text: 'retry safely', clientMessageId: 'stable-retry-id' }
    };
    const first = await ctx.callables.sendPrivateMessageV2(payload);
    const retry = await ctx.callables.sendPrivateMessageV2(payload);
    assert.equal(first.messageId, retry.messageId);
    assert.equal(first.duplicate, false);
    assert.equal(retry.duplicate, true);
    assert.equal(ctx.records.get(`users/bob/chats/${chatId}`).unread, 1);
    assert.equal([...ctx.records.keys()].filter(path => path.startsWith(`chats/${chatId}/messages/`)).length, 1);
    assert.equal([...ctx.records.keys()].filter(path => path.startsWith('users/bob/notifications/')).length, 1);
    await assert.rejects(ctx.callables.sendPrivateMessageV2({
        ...payload, data: { ...payload.data, text: 'different content' }
    }), error => error.code === 'already-exists');
});

test('recipient can mark a message read once and unread count is owner-scoped', async () => {
    const ctx = createHarness(friendSeed());
    const { chatId } = await createChat(ctx);
    const sent = await ctx.callables.sendPrivateMessageV2({
        auth: { uid: 'alice' }, data: { chatId, text: 'hello', clientMessageId: 'test-message-5' }
    });
    assert.deepEqual(await ctx.callables.getPrivateChatUnreadV2({
        auth: { uid: 'bob' }, data: { chatId }
    }), { unread: 1 });
    await ctx.callables.markPrivateMessageReadV2({
        auth: { uid: 'bob' }, data: { chatId, messageId: sent.messageId }
    });
    await ctx.callables.markPrivateMessageReadV2({
        auth: { uid: 'bob' }, data: { chatId, messageId: sent.messageId }
    });
    assert.equal(ctx.records.get(`users/bob/chats/${chatId}`).unread, 0);
    assert.equal(ctx.records.get(`chats/${chatId}/messages/${sent.messageId}`).read, true);
    await assert.rejects(ctx.callables.getPrivateChatUnreadV2({
        auth: { uid: 'mallory' }, data: { chatId }
    }), error => error.code === 'permission-denied');
});

test('message payload is bounded and cannot forge sender identity', async () => {
    const ctx = createHarness(friendSeed());
    const { chatId } = await createChat(ctx);
    await assert.rejects(ctx.callables.sendPrivateMessageV2({
        auth: { uid: 'alice' }, data: { chatId, text: 'x'.repeat(4001), clientMessageId: 'too-long' }
    }), error => error.code === 'invalid-argument');
    await assert.rejects(ctx.callables.sendPrivateMessageV2({
        auth: { uid: 'alice' }, data: { chatId, text: 'hi', clientMessageId: 'test-forged', senderId: 'bob' }
    }), error => error.code === 'invalid-argument');
    await assert.rejects(ctx.callables.getPrivateChatHistoryV2({
        auth: { uid: 'alice' }, data: { chatId, targetUid: 'bob' }
    }), error => error.code === 'invalid-argument');
});

test('callable factory fails closed when required dependencies are missing', () => {
    assert.throws(() => createChatCallables({}), TypeError);
});
