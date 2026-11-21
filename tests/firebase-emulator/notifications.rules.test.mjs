import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';

const projectId = 'demo-dreamandgo-notifications';
const rules = readFileSync(new URL('./notifications.rules', import.meta.url), 'utf8');

test('notification rules allow owner reads and only one-way read-state updates', async () => {
    assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run with Firebase Firestore emulator');
    const env = await initializeTestEnvironment({ projectId, firestore: { rules } });
    try {
        await env.withSecurityRulesDisabled(async ctx => {
            const db = ctx.firestore();
            await setDoc(doc(db, 'users/alice/notifications/friend_request_bob'), {
                type: 'friend_request', title: 'Новая заявка в друзья',
                message: 'Пользователь хочет добавить тебя в друзья',
                icon: 'bi-person-plus', color: 'primary', link: '#friends',
                fromUserId: 'bob', read: false, createdAt: new Date()
            });
            await setDoc(doc(db, 'users/alice/notifications/message_123'), {
                type: 'message', title: 'Новое сообщение', message: 'Привет',
                icon: 'bi-chat-dots', color: 'primary', link: '#chat',
                fromUserId: 'bob', chatId: 'chat-1', read: false, createdAt: new Date()
            });
        });

        const alice = env.authenticatedContext('alice').firestore();
        const bob = env.authenticatedContext('bob').firestore();
        const guest = env.unauthenticatedContext().firestore();
        const ownNotice = doc(alice, 'users/alice/notifications/message_123');
        const friendNotice = doc(alice, 'users/alice/notifications/friend_request_bob');

        await assertSucceeds(getDoc(ownNotice));
        await assertSucceeds(getDocs(query(collection(alice, 'users/alice/notifications'), orderBy('createdAt', 'desc'))));
        await assertFails(getDoc(doc(bob, 'users/alice/notifications/message_123')));
        await assertFails(getDocs(collection(bob, 'users/alice/notifications')));
        await assertFails(getDoc(doc(guest, 'users/alice/notifications/message_123')));
        await assertFails(getDocs(collection(guest, 'users/alice/notifications')));

        await assertSucceeds(updateDoc(ownNotice, { read: true }));
        await assertSucceeds(updateDoc(friendNotice, { read: true }));
        await assertFails(updateDoc(ownNotice, { read: false }));
        await assertFails(updateDoc(ownNotice, { title: 'Подмена заголовка' }));
        await assertFails(updateDoc(ownNotice, { read: true, fromUserId: 'mallory' }));
        await assertFails(updateDoc(ownNotice, { read: true, type: 'friend_accepted' }));
        await assertFails(updateDoc(doc(bob, 'users/alice/notifications/message_123'), { read: true }));
        await assertFails(setDoc(doc(alice, 'users/alice/notifications/client-forged'), {
            type: 'message', title: 'Fake', read: false
        }));
        await assertFails(deleteDoc(ownNotice));
    } finally {
        await env.cleanup();
    }
});
