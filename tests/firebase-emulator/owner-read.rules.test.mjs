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
        await assertSucceeds(updateDoc(doc(alice, 'users', 'alice'), {
            displayName: 'Алиса', bio: 'О себе', location: 'Москва'
        }));
        await assertSucceeds(updateDoc(doc(alice, 'users', 'alice'), {
            bio: 'Обновлённая биография'
        }));
        await assertFails(updateDoc(doc(bob, 'users', 'alice'), { bio: 'Подмена' }));
        await assertFails(updateDoc(doc(alice, 'users', 'alice'), {
            username: 'taken', displayName: 'Алиса', bio: '', location: ''
        }));
        await assertFails(updateDoc(doc(alice, 'users', 'alice'), { usernameNormalized: 'admin' }));
        // Public visibility is server-owned consent; the browser cannot forge it.
        await assertFails(updateDoc(doc(alice, 'users', 'alice'), { publicProfileEnabled: true }));
        await assertFails(updateDoc(doc(alice, 'users', 'alice'), { publicProfileEnabled: false }));
        await assertFails(setDoc(doc(alice, 'users', 'alice'), {
            email: 'alice@example.test', username: 'alice', publicProfileEnabled: true
        }));
        await assertFails(updateDoc(doc(alice, 'users', 'alice'), { stats: { level: 9000 } }));
        await assertFails(updateDoc(doc(alice, 'users', 'alice'), { achievements: ['all'] }));
        await assertFails(updateDoc(doc(alice, 'users', 'alice'), { permissions: ['admin'] }));
        await assertFails(updateDoc(doc(alice, 'users', 'alice'), { displayName: 'x'.repeat(81) }));
        await assertFails(updateDoc(doc(alice, 'users', 'alice'), { bio: 'x'.repeat(501) }));
        await assertFails(updateDoc(doc(alice, 'users', 'alice'), { location: 12 }));
        await assertFails(updateDoc(doc(alice, 'users', 'alice'), { bio: null }));
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
            createdAt: serverTimestamp(),
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
        await assertSucceeds(setDoc(doc(alice, 'users', 'alice', 'dreams', 'legacy-flag'), {
            ...validDream(), isPublic: false
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
        await assertFails(updateDoc(newDream, { isPublic: false, updatedAt: serverTimestamp() }));
        await assertSucceeds(deleteDoc(newDream));

    } finally {
        await env.cleanup();
    }
});


test('private collection matrix: owners can read, other accounts and guests cannot', async () => {
    assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run with Firebase Firestore emulator');
    const env = await initializeTestEnvironment({ projectId, firestore: { rules } });
    const categories = [
        'travels', 'restaurants', 'movies', 'books', 'dreams',
        'dailyTasks', 'notifications', 'friends', 'friendRequests',
        'sentRequests', 'chats', 'messages'
    ];
    try {
        await env.withSecurityRulesDisabled(async ctx => {
            const db = ctx.firestore();
            await setDoc(doc(db, 'users', 'alice'), { email: 'alice@example.test', username: 'alice' });
            await setDoc(doc(db, 'users', 'bob'), { email: 'bob@example.test', username: 'bob' });
            for (const category of categories) {
                await setDoc(doc(db, 'users', 'alice', category, 'private-1'), {
                    title: 'Only Alice', createdAt: new Date()
                });
            }
        });

        const alice = env.authenticatedContext('alice').firestore();
        const bob = env.authenticatedContext('bob').firestore();
        const guest = env.unauthenticatedContext().firestore();

        for (const category of categories) {
            const path = ['users', 'alice', category, 'private-1'];
            await assertSucceeds(getDoc(doc(alice, ...path)));
            await assertSucceeds(getDocs(collection(alice, 'users', 'alice', category)));
            await assertFails(getDoc(doc(bob, ...path)));
            await assertFails(getDocs(collection(bob, 'users', 'alice', category)));
            await assertFails(getDoc(doc(guest, ...path)));
            await assertFails(getDocs(collection(guest, 'users', 'alice', category)));
            await assertFails(updateDoc(doc(bob, ...path), { title: 'Changed by Bob' }));
            await assertFails(deleteDoc(doc(bob, ...path)));
        }

        await assertFails(getDocs(collection(guest, 'users')));
        await assertFails(getDocs(collection(bob, 'users')));
        await assertFails(getDocs(collection(alice, 'users')));

        // The recovery prototype is intentionally read-only outside the
        // explicitly validated dreams/profile paths. Owner identity alone
        // must not grant writes to social, notification, task or chat records.
        for (const category of categories.filter(name => name !== 'dreams')) {
            const ownedRecord = doc(alice, 'users', 'alice', category, 'private-1');
            await assertFails(setDoc(doc(alice, 'users', 'alice', category, 'forged'), {
                senderId: 'alice', text: 'forged', title: 'forged'
            }));
            await assertFails(updateDoc(ownedRecord, { title: 'Owner write is disabled in recovery mode' }));
            await assertFails(deleteDoc(ownedRecord));
        }

        // Server-authoritative records and cross-user/public indexes remain
        // inaccessible even when a client knows the exact document path.
        const serverOwnedPaths = [
            ['serverXp', 'alice'],
            ['serverXp', 'alice', 'events', 'event-1'],
            ['serverXp', 'alice', 'daily', '2026-11-20'],
            ['serverDailyTasks', 'alice'],
            ['serverDailyTasks', 'alice', 'claims', 'claim-1'],
            ['system', 'usernameRegistry'],
            ['usernameReservations', 'alice'],
            ['chatPairs', 'alice_bob'],
            ['publicProfiles', 'alice'],
            ['chats', 'private-room']
        ];
        for (const path of serverOwnedPaths) {
            const record = doc(alice, ...path);
            await assertFails(getDoc(record));
            await assertFails(setDoc(record, { ownerId: 'alice', xp: 999999, role: 'admin' }));
            await assertFails(deleteDoc(record));
        }
    } finally {
        await env.cleanup();
    }
});
