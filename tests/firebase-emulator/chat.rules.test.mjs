import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const projectId = 'demo-dreamandgo-chat-rules';
const rules = readFileSync(new URL('./chat.rules', import.meta.url), 'utf8');

test('candidate chat membership rules deny outsiders and forged messages', async () => {
    assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run with Firebase Firestore emulator');
    const env = await initializeTestEnvironment({ projectId, firestore: { rules } });
    try {
        await env.withSecurityRulesDisabled(async ctx => {
            const db = ctx.firestore();
            await setDoc(doc(db, 'chats', 'room-1'), {
                participants: ['alice', 'bob'],
                state: 'active'
            });
            await setDoc(doc(db, 'chats', 'room-1', 'messages', 'alice-original'), {
                senderId: 'alice', text: 'hello', read: false, edited: false
            });
        });

        const alice = env.authenticatedContext('alice').firestore();
        const bob = env.authenticatedContext('bob').firestore();
        const charlie = env.authenticatedContext('charlie').firestore();
        const guest = env.unauthenticatedContext().firestore();
        const chat = doc(alice, 'chats', 'room-1');
        const msg = id => doc(alice, 'chats', 'room-1', 'messages', id);
        const payload = (senderId, text = 'hello') => ({
            senderId, text, read: false, edited: false, createdAt: serverTimestamp()
        });

        await assertSucceeds(getDoc(chat));
        await assertSucceeds(getDoc(doc(bob, 'chats', 'room-1')));
        await assertFails(getDoc(doc(charlie, 'chats', 'room-1')));
        await assertFails(getDoc(doc(guest, 'chats', 'room-1')));
        await assertFails(getDoc(doc(charlie, 'chats', 'room-1', 'messages', 'alice-original')));
        await assertFails(setDoc(doc(charlie, 'chats', 'room-1', 'messages', 'forged'), payload('charlie')));
        await assertFails(setDoc(doc(guest, 'chats', 'room-1', 'messages', 'guest'), payload('alice')));
        await assertFails(setDoc(msg('impersonation'), payload('bob')));
        await assertFails(setDoc(msg('empty'), payload('alice', '')));
        await assertFails(setDoc(msg('oversized'), payload('alice', 'x'.repeat(2001))));
        await assertSucceeds(setDoc(msg('valid'), payload('alice', 'new message')));
        await assertFails(updateDoc(doc(bob, 'chats', 'room-1', 'messages', 'alice-original'), { text: 'hijacked' }));
        await assertFails(deleteDoc(doc(bob, 'chats', 'room-1', 'messages', 'alice-original')));
        await assertFails(updateDoc(chat, { participants: ['alice', 'charlie'] }));
        await assertFails(setDoc(doc(alice, 'chats', 'fake'), { participants: ['alice', 'bob'], state: 'active' }));

        await env.withSecurityRulesDisabled(async ctx => {
            await updateDoc(doc(ctx.firestore(), 'chats', 'room-1'), { state: 'deleting' });
        });
        await assertFails(setDoc(msg('late'), payload('alice')));
    } finally {
        await env.cleanup();
    }
});
