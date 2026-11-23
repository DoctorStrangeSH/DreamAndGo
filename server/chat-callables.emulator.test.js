import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createChatCallables } from './chat-callables.js';

const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const available = Boolean(firestoreHost);
const projectId = process.env.GCLOUD_PROJECT || 'demo-dream-and-go';
const createdPaths = [];
let app;
let db;
let endpoints;

class EmulatorHttpsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function uniqueId() {
    return randomBytes(8).toString('hex');
}

async function createPair() {
    const suffix = uniqueId();
    const alice = `chat-a-${suffix}`;
    const bob = `chat-b-${suffix}`;
    const chatCallables = endpoints;

    await Promise.all([
        db.collection('users').doc(alice).set({ username: 'alice-test' }),
        db.collection('users').doc(bob).set({ username: 'bob-test' }),
        db.collection('users').doc(alice).collection('friends').doc(bob).set({ friendId: bob }),
        db.collection('users').doc(bob).collection('friends').doc(alice).set({ friendId: alice })
    ]);
    createdPaths.push(
        db.collection('users').doc(alice),
        db.collection('users').doc(bob)
    );
    const created = await chatCallables.createPrivateChatV2({
        auth: { uid: alice }, data: { targetUid: bob }
    });
    createdPaths.push(db.collection('chats').doc(created.chatId));
    return { alice, bob, chatId: created.chatId };
}

before(async () => {
    if (!available) return;
    app = initializeApp({ projectId }, `chat-v2-emulator-${process.pid}`);
    db = getFirestore(app);
    const registrations = [];
    endpoints = createChatCallables({
        onCall(options, handler) {
            registrations.push({ options, handler });
            return handler;
        },
        HttpsError: EmulatorHttpsError,
        getFirestore: () => db,
        FieldValue
    });
    assert.equal(registrations.length, 7);
    assert.ok(registrations.every(item => item.options.enforceAppCheck === true));
    assert.ok(registrations.every(item => item.options.region === 'europe-west3'));
});

after(async () => {
    if (!app) return;
    await Promise.all(createdPaths.map(ref => db.recursiveDelete(ref).catch(() => {})));
    await deleteApp(app);
});

test('Firestore Emulator enforces canonical membership and atomic private messaging', { skip: !available }, async () => {
    const { alice, bob, chatId } = await createPair();
    const outsider = `chat-c-${uniqueId()}`;
    await db.collection('users').doc(outsider).set({ username: 'outsider' });
    createdPaths.push(db.collection('users').doc(outsider));

    const inboxResult = await endpoints.getMyPrivateChatsV2({
        auth: { uid: alice }, data: {}
    });
    assert.equal(inboxResult.chats.length, 1);
    assert.equal(inboxResult.chats[0].chatId, chatId);
    assert.equal(inboxResult.chats[0].partnerId, bob);

    const chat = await db.collection('chats').doc(chatId).get();
    assert.deepEqual(chat.get('participants'), [alice, bob].sort());
    assert.equal(chat.get('type'), 'private');

    await assert.rejects(endpoints.sendPrivateMessageV2({
        auth: { uid: outsider }, data: { chatId, text: 'unauthorized' }
    }), error => error.code === 'permission-denied');
    await assert.rejects(endpoints.getPrivateChatHistoryV2({
        auth: { uid: outsider }, data: { chatId }
    }), error => error.code === 'permission-denied');

    const sent = await endpoints.sendPrivateMessageV2({
        auth: { uid: alice }, data: { chatId, text: 'emulator message' }
    });
    const message = await db.collection('chats').doc(chatId)
        .collection('messages').doc(sent.messageId).get();
    assert.equal(message.get('senderId'), alice);
    assert.equal(message.get('text'), 'emulator message');

    const inbox = await db.collection('users').doc(bob).collection('chats').doc(chatId).get();
    assert.equal(inbox.get('unread'), 1);

    const notifications = await db.collection('users').doc(bob)
        .collection('notifications').get();
    assert.equal(notifications.size, 1);
    assert.equal(notifications.docs[0].get('message').includes('emulator message'), false);

    const history = await endpoints.getPrivateChatHistoryV2({
        auth: { uid: bob }, data: { chatId }
    });
    assert.equal(history.messages.length, 1);
    assert.equal(history.messages[0].text, 'emulator message');

    await endpoints.markPrivateMessageReadV2({
        auth: { uid: bob }, data: { chatId, messageId: sent.messageId }
    });
    const updatedMessage = await db.collection('chats').doc(chatId)
        .collection('messages').doc(sent.messageId).get();
    assert.equal(updatedMessage.get('read'), true);
    assert.equal((await endpoints.getPrivateChatUnreadV2({
        auth: { uid: bob }, data: { chatId }
    })).unread, 0);
});

test('Firestore Emulator rejects non-friend chat creation and forged callable fields', { skip: !available }, async () => {
    const suffix = uniqueId();
    const alice = `not-friend-a-${suffix}`;
    const bob = `not-friend-b-${suffix}`;
    await Promise.all([
        db.collection('users').doc(alice).set({ username: 'alice' }),
        db.collection('users').doc(bob).set({ username: 'bob' })
    ]);
    createdPaths.push(db.collection('users').doc(alice), db.collection('users').doc(bob));

    await assert.rejects(endpoints.createPrivateChatV2({
        auth: { uid: alice }, data: { targetUid: bob }
    }), error => error.code === 'permission-denied');
    await assert.rejects(endpoints.createPrivateChatV2({
        auth: { uid: alice }, data: { targetUid: bob, actorUid: bob }
    }), error => error.code === 'invalid-argument');
});
