import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const projectId = 'demo-dreamandgo-dreams-v1';
const rules = readFileSync(new URL('./collections-v1.rules', import.meta.url), 'utf8');

const validDream = () => ({
    title: 'Выучить новый язык',
    category: 'Знания',
    status: 'in_progress',
    description: 'Заниматься понемногу каждый день',
    progress: 45,
    deadline: '2027-12-31',
    steps: [{ text: 'Пройти первый урок', done: false }],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
});

test('dream V1 rules enforce owner CRUD, private visibility, nested steps and timestamps', async () => {
    assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run with Firebase Firestore emulator');
    const env = await initializeTestEnvironment({ projectId, firestore: { rules } });
    try {
        await env.withSecurityRulesDisabled(async ctx => {
            const db = ctx.firestore();
            await setDoc(doc(db, 'users/alice'), { email: 'alice@example.test', username: 'alice' });
            await setDoc(doc(db, 'users/bob'), { email: 'bob@example.test', username: 'bob' });
            await setDoc(doc(db, 'users/alice/dreams/legacy-public'), {
                ...validDream(), isPublic: true
            });
        });

        const alice = env.authenticatedContext('alice').firestore();
        const bob = env.authenticatedContext('bob').firestore();
        const guest = env.unauthenticatedContext().firestore();
        const own = doc(alice, 'users/alice/dreams/dream-1');

        await assertSucceeds(setDoc(own, validDream()));
        await assertSucceeds(getDoc(own));
        await assertSucceeds(getDocs(collection(alice, 'users/alice/dreams')));
        await assertSucceeds(updateDoc(own, {
            progress: 50,
            updatedAt: serverTimestamp()
        }));

        const bobPath = doc(bob, 'users/alice/dreams/dream-1');
        await assertFails(getDoc(bobPath));
        await assertFails(getDocs(collection(bob, 'users/alice/dreams')));
        await assertFails(setDoc(bobPath, validDream()));
        await assertFails(updateDoc(bobPath, { progress: 60, updatedAt: serverTimestamp() }));
        await assertFails(deleteDoc(bobPath));

        const guestPath = doc(guest, 'users/alice/dreams/dream-1');
        await assertFails(getDoc(guestPath));
        await assertFails(setDoc(guestPath, validDream()));

        await assertFails(setDoc(doc(alice, 'users/alice/dreams/public-dream'), {
            ...validDream(), isPublic: true
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/dreams/invalid-visibility'), {
            ...validDream(), isPublic: 'true'
        }));
        await assertSucceeds(updateDoc(doc(alice, 'users/alice/dreams/legacy-public'), {
            title: 'Сохранённая старая мечта',
            updatedAt: serverTimestamp()
        }));
        await assertFails(updateDoc(doc(alice, 'users/alice/dreams/legacy-public'), {
            isPublic: false,
            updatedAt: serverTimestamp()
        }));
        await assertSucceeds(setDoc(doc(alice, 'users/alice/dreams/private-dream'), {
            ...validDream(), isPublic: false
        }));
        await assertFails(updateDoc(own, { isPublic: true, updatedAt: serverTimestamp() }));
        await assertFails(updateDoc(own, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));

        await assertFails(setDoc(doc(alice, 'users/alice/dreams/extra-field'), {
            ...validDream(), isAdmin: true
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/dreams/invalid-category'), {
            ...validDream(), category: 'Unknown'
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/dreams/invalid-status'), {
            ...validDream(), status: 'public'
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/dreams/invalid-progress'), {
            ...validDream(), progress: 101
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/dreams/invalid-deadline'), {
            ...validDream(), deadline: '2027-99-99'
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/dreams/impossible-deadline'), {
            ...validDream(), deadline: '2027-02-29'
        }));
        await assertSucceeds(setDoc(doc(alice, 'users/alice/dreams/leap-day'), {
            ...validDream(), deadline: '2028-02-29'
        }));
        await assertSucceeds(setDoc(doc(alice, 'users/alice/dreams/no-deadline'), {
            ...validDream(), deadline: ''
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/dreams/too-many-steps'), {
            ...validDream(), steps: Array(21).fill({ text: 'Шаг', done: false })
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/dreams/invalid-step'), {
            ...validDream(), steps: [{ text: 'Шаг', done: 'false' }]
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/dreams/step-extra-field'), {
            ...validDream(), steps: [{ text: 'Шаг', done: false, admin: true }]
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/dreams/forged-created'), {
            ...validDream(), createdAt: new Date(0)
        }));

        await assertSucceeds(deleteDoc(own));
        await assertSucceeds(deleteDoc(doc(alice, 'users/alice/dreams/private-dream')));
    } finally {
        await env.cleanup();
    }
});
