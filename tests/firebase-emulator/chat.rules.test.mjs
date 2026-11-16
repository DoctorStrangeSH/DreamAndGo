import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

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

test('chat membership protects message lists, immutable authorship and closed rooms', async () => {
    assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run with Firebase Firestore emulator');
    const env = await initializeTestEnvironment({ projectId, firestore: { rules } });
    try {
        await env.withSecurityRulesDisabled(async ctx => {
            const db = ctx.firestore();
            await setDoc(doc(db, 'chats', 'private'), { participants: ['alice', 'bob'], state: 'active' });
            await setDoc(doc(db, 'chats', 'closed'), { participants: ['alice', 'bob'], state: 'closed' });
            await setDoc(doc(db, 'chats', 'private', 'messages', 'from-alice'), {
                senderId: 'alice', text: 'first', createdAt: new Date(), read: false, edited: false
            });
            await setDoc(doc(db, 'chats', 'closed', 'messages', 'old'), {
                senderId: 'alice', text: 'archived', createdAt: new Date(), read: false, edited: false
            });
        });

        const alice = env.authenticatedContext('alice').firestore();
        const bob = env.authenticatedContext('bob').firestore();
        const outsider = env.authenticatedContext('charlie').firestore();
        const guest = env.unauthenticatedContext().firestore();
        const inbox = db => collection(db, 'chats', 'private', 'messages');
        const authored = db => doc(db, 'chats', 'private', 'messages', 'from-alice');
        const validMessage = () => ({
            senderId: 'alice', text: 'hello', createdAt: serverTimestamp(), read: false, edited: false
        });

        await assertSucceeds(getDocs(inbox(alice)));
        await assertSucceeds(getDocs(inbox(bob)));
        await assertFails(getDocs(inbox(outsider)));
        await assertFails(getDocs(inbox(guest)));
        await assertFails(getDocs(collection(alice, 'chats')));
        await assertFails(getDocs(collection(outsider, 'chats')));
        await assertFails(updateDoc(authored(bob), {
            text: 'spoofed', edited: true, editedAt: serverTimestamp()
        }));
        await assertFails(updateDoc(authored(outsider), {
            text: 'spoofed', edited: true, editedAt: serverTimestamp()
        }));
        await assertFails(updateDoc(authored(alice), { senderId: 'bob' }));
        await assertFails(updateDoc(authored(alice), { read: true }));
        await assertFails(updateDoc(authored(alice), { edited: false }));
        await assertFails(updateDoc(authored(alice), { text: '' }));
        await assertFails(updateDoc(authored(alice), { text: 'x'.repeat(2001) }));
        await assertSucceeds(updateDoc(authored(alice), {
            text: 'edited safely', edited: true, editedAt: serverTimestamp()
        }));
        await assertFails(setDoc(doc(alice, 'chats', 'private', 'messages', 'unexpected-field'), {
            ...validMessage(), isAdmin: true
        }));
        await assertFails(setDoc(doc(alice, 'chats', 'private', 'messages', 'wrong-time'), {
            ...validMessage(), createdAt: new Date(0)
        }));
        await assertFails(setDoc(doc(alice, 'chats', 'private', 'messages', 'wrong-read'), {
            ...validMessage(), read: true
        }));

        await assertSucceeds(getDocs(collection(alice, 'chats', 'closed', 'messages')));
        await assertFails(setDoc(doc(alice, 'chats', 'closed', 'messages', 'late'), validMessage()));
        await assertFails(updateDoc(doc(alice, 'chats', 'closed', 'messages', 'old'), {
            text: 'changed', edited: true, editedAt: serverTimestamp()
        }));
        await assertFails(deleteDoc(doc(alice, 'chats', 'closed', 'messages', 'old')));
    } finally {
        await env.cleanup();
    }
});
