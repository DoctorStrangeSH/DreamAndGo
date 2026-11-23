import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const available = Boolean(emulatorHost);
const projectId = process.env.GCLOUD_PROJECT || 'demo-dream-and-go';
let environment;
let aliceDb;
let bobDb;
let outsiderDb;
let anonymousDb;

before(async () => {
    if (!available) return;
    const [host, portValue] = emulatorHost.split(':');
    const port = Number(portValue);
    assert.ok(host && Number.isInteger(port) && port > 0);
    const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
    environment = await initializeTestEnvironment({
        projectId,
        firestore: { host, port, rules }
    });
    aliceDb = environment.authenticatedContext('alice').firestore();
    bobDb = environment.authenticatedContext('bob').firestore();
    outsiderDb = environment.authenticatedContext('mallory').firestore();
    anonymousDb = environment.unauthenticatedContext().firestore();

    await environment.withSecurityRulesDisabled(async context => {
        const db = context.firestore();
        await setDoc(doc(db, 'chats/chat-1'), {
            type: 'private',
            schemaVersion: 2,
            participants: ['alice', 'bob']
        });
        await setDoc(doc(db, 'chats/chat-1/messages/message-1'), {
            senderId: 'alice',
            text: 'private hello',
            read: false
        });
        await setDoc(doc(db, 'users/alice/chats/chat-1'), {
            chatId: 'chat-1',
            partnerId: 'bob',
            unread: 0
        });
        await setDoc(doc(db, 'users/bob/chats/chat-1'), {
            chatId: 'chat-1',
            partnerId: 'alice',
            unread: 1
        });
        await setDoc(doc(db, 'publicProfiles/alice'), {
            username: 'alice',
            displayName: 'Alice'
        });
    });
});

after(async () => {
    if (environment) await environment.cleanup();
});

test('chat participants can read canonical membership and message history', { skip: !available }, async () => {
    assert.equal((await assertSucceeds(getDoc(doc(aliceDb, 'chats/chat-1')))).exists(), true);
    assert.equal((await assertSucceeds(getDoc(doc(bobDb, 'chats/chat-1')))).exists(), true);
    const messages = await assertSucceeds(getDocs(collection(aliceDb, 'chats/chat-1/messages')));
    assert.equal(messages.size, 1);
    assert.equal(messages.docs[0].get('text'), 'private hello');
    assert.equal((await assertSucceeds(getDoc(doc(bobDb, 'chats/chat-1/messages/message-1')))).exists(), true);
});

test('unrelated and anonymous users cannot read another private chat', { skip: !available }, async () => {
    await assertFails(getDoc(doc(outsiderDb, 'chats/chat-1')));
    await assertFails(getDocs(collection(outsiderDb, 'chats/chat-1/messages')));
    await assertFails(getDoc(doc(anonymousDb, 'chats/chat-1')));
    await assertFails(getDoc(doc(anonymousDb, 'chats/chat-1/messages/message-1')));
});

test('inbox summaries are readable only by their owner', { skip: !available }, async () => {
    assert.equal((await assertSucceeds(getDoc(doc(aliceDb, 'users/alice/chats/chat-1')))).exists(), true);
    assert.equal((await assertSucceeds(getDocs(collection(aliceDb, 'users/alice/chats')))).size, 1);
    await assertFails(getDoc(doc(bobDb, 'users/alice/chats/chat-1')));
    await assertFails(getDocs(collection(bobDb, 'users/alice/chats')));
    await assertFails(getDoc(doc(outsiderDb, 'users/alice/chats/chat-1')));
    await assertFails(getDoc(doc(anonymousDb, 'users/alice/chats/chat-1')));
});

test('clients cannot create, mutate or delete chat membership, messages or inbox summaries', { skip: !available }, async () => {
    await assertFails(setDoc(doc(aliceDb, 'chats/chat-2'), {
        type: 'private', schemaVersion: 2, participants: ['alice', 'mallory']
    }));
    await assertFails(updateDoc(doc(aliceDb, 'chats/chat-1'), { participants: ['alice', 'mallory'] }));
    await assertFails(setDoc(doc(aliceDb, 'chats/chat-1/messages/forged'), {
        senderId: 'alice', text: 'forged'
    }));
    await assertFails(updateDoc(doc(aliceDb, 'chats/chat-1/messages/message-1'), { read: true }));
    await assertFails(deleteDoc(doc(aliceDb, 'chats/chat-1/messages/message-1')));
    await assertFails(updateDoc(doc(aliceDb, 'users/alice/chats/chat-1'), { unread: 999 }));
    await assertFails(deleteDoc(doc(aliceDb, 'users/alice/chats/chat-1')));
    await assertFails(setDoc(doc(aliceDb, 'users/alice/blockedUsers/bob'), { uid: 'bob' }));
    await assertFails(getDoc(doc(aliceDb, 'users/alice/blockedUsers/bob')));
});

test('public profile projections are readable but never client-writable', { skip: !available }, async () => {
    assert.equal((await assertSucceeds(getDoc(doc(anonymousDb, 'publicProfiles/alice')))).exists(), true);
    await assertFails(updateDoc(doc(aliceDb, 'publicProfiles/alice'), { username: 'forged' }));
});
