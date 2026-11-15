import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, orderBy, serverTimestamp } from 'firebase/firestore';

const projectId = 'demo-dreamandgo-owner-read';
const rules = readFileSync(new URL('./owner-read.rules', import.meta.url), 'utf8');

test('owner-only read recovery: guest and other users cannot read PII or write', async () => {
    assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run with Firebase Firestore emulator');
    const env = await initializeTestEnvironment({ projectId, firestore: { rules } });
    try {
        await env.withSecurityRulesDisabled(async ctx => {
            const db = ctx.firestore();
            await setDoc(doc(db, 'users', 'alice'), { email: 'alice@example.test', username: 'alice' });
            await setDoc(doc(db, 'users', 'bob'), { email: 'bob@example.test', username: 'bob' });
            await setDoc(doc(db, 'users', 'alice', 'dreams', 'd1'), { title: 'Private dream', createdAt: new Date() });
            await setDoc(doc(db, 'users', 'alice', 'friends', 'bob'), { friendId: 'bob' });
            await setDoc(doc(db, 'publicProfiles', 'alice'), { username: 'alice' });
        });

        const alice = env.authenticatedContext('alice').firestore();
        const bob = env.authenticatedContext('bob').firestore();
        const guest = env.unauthenticatedContext().firestore();

        await assertSucceeds(getDoc(doc(alice, 'users', 'alice')));
        await assertSucceeds(getDoc(doc(alice, 'users', 'alice', 'dreams', 'd1')));
        await assertSucceeds(getDocs(query(collection(alice, 'users', 'alice', 'dreams'), orderBy('createdAt', 'desc'))));
        await assertSucceeds(getDoc(doc(alice, 'users', 'alice', 'friends', 'bob')));

        await assertFails(getDoc(doc(bob, 'users', 'alice')));
        await assertFails(getDoc(doc(guest, 'users', 'alice')));
        await assertFails(getDocs(collection(alice, 'users')));
        await assertFails(getDoc(doc(bob, 'users', 'alice', 'dreams', 'd1')));
        await assertFails(getDocs(collection(bob, 'users', 'alice', 'dreams')));
        await assertFails(getDoc(doc(guest, 'users', 'alice', 'dreams', 'd1')));
        await assertFails(getDoc(doc(alice, 'publicProfiles', 'alice')));
        await assertFails(getDoc(doc(alice, 'users', 'alice', 'unknownCollection', 'x')));

        await assertFails(setDoc(doc(alice, 'users', 'charlie'), { email: 'c@example.test', username: 'c', isAdmin: true }));
        await assertFails(setDoc(doc(alice, 'users', 'alice', 'dreams', 'x'), { title: 'x'.repeat(100_000) }));
        await assertFails(setDoc(doc(alice, 'users', 'alice', 'dreams', 'x2'), { ownerId: 'bob' }));
        await assertFails(updateDoc(doc(alice, 'users', 'alice'), { email: 'changed@example.test' }));
        await assertFails(updateDoc(doc(alice, 'users', 'alice'), { role: 'admin' }));
        await assertFails(updateDoc(doc(alice, 'users', 'alice', 'dreams', 'd1'), { title: 'changed' }));
        await assertFails(updateDoc(doc(alice, 'users', 'alice', 'dreams', 'd1'), { createdAt: new Date(0) }));
        await assertFails(deleteDoc(doc(bob, 'users', 'alice', 'dreams', 'd1')));
        await assertFails(deleteDoc(doc(alice, 'users', 'alice')));
        await assertFails(setDoc(doc(bob, 'users', 'alice', 'friends', 'bob'), { friendId: 'bob' }));
        await assertFails(setDoc(doc(alice, 'chats', 'room-1', 'messages', 'msg'), { text: 'forged' }));

        const validDream = () => ({
            title: 'Моя мечта', category: 'Знания', status: 'dreaming',
            description: 'Учиться', progress: 0, deadline: null,
            steps: [{ text: 'Первый шаг', done: false }],
            isPublic: false, createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        const newDream = doc(alice, 'users', 'alice', 'dreams', 'new');
        await assertSucceeds(setDoc(newDream, validDream()));
        await assertSucceeds(updateDoc(newDream, {
            title: 'Моя новая мечта', updatedAt: serverTimestamp()
        }));
        await assertFails(setDoc(doc(bob, 'users', 'alice', 'dreams', 'forged'), validDream()));
        await assertFails(setDoc(doc(alice, 'users', 'alice', 'dreams', 'public'), {
            ...validDream(), isPublic: true
        }));
        await assertFails(setDoc(doc(alice, 'users', 'alice', 'dreams', 'role'), {
            ...validDream(), role: 'admin'
        }));
        await assertFails(setDoc(doc(alice, 'users', 'alice', 'dreams', 'nested'), {
            ...validDream(), steps: [{ text: 'ok', done: false, role: 'admin' }]
        }));
        await assertFails(setDoc(doc(alice, 'users', 'alice', 'dreams', 'overflow'), {
            ...validDream(), steps: [{ text: 'x'.repeat(201), done: false }]
        }));
        await assertFails(updateDoc(newDream, { createdAt: serverTimestamp() }));
        await assertFails(updateDoc(newDream, { title: 'x'.repeat(121), updatedAt: serverTimestamp() }));
        await assertFails(updateDoc(newDream, { isPublic: true, updatedAt: serverTimestamp() }));
        await assertSucceeds(deleteDoc(newDream));

    } finally {
        await env.cleanup();
    }
});
