import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const projectId = 'demo-dreamandgo-collections-v1';
const rules = readFileSync(new URL('./collections-v1.rules', import.meta.url), 'utf8');

const validTravel = () => ({
    title: 'Поездка в горы',
    type: 'mountains',
    status: 'planned',
    location: 'Алтай',
    description: 'Маршрут на выходные',
    budget: { planned: 50000, spent: 0, currency: 'RUB' },
    rating: 0,
    notes: '',
    photos: ['https://cdn.example.test/travel.jpg'],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
});

test('travel V1 rules enforce owner CRUD, schema allowlist and server timestamps', async () => {
    assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run with Firebase Firestore emulator');
    const env = await initializeTestEnvironment({ projectId, firestore: { rules } });
    try {
        await env.withSecurityRulesDisabled(async ctx => {
            const db = ctx.firestore();
            await setDoc(doc(db, 'users/alice'), { email: 'alice@example.test', username: 'alice' });
            await setDoc(doc(db, 'users/bob'), { email: 'bob@example.test', username: 'bob' });
        });

        const alice = env.authenticatedContext('alice').firestore();
        const bob = env.authenticatedContext('bob').firestore();
        const guest = env.unauthenticatedContext().firestore();
        const own = doc(alice, 'users/alice/travels/trip-1');

        await assertSucceeds(setDoc(own, validTravel()));
        await assertSucceeds(getDoc(own));
        await assertSucceeds(getDocs(collection(alice, 'users/alice/travels')));
        await assertSucceeds(updateDoc(own, { title: 'Обновлённая поездка', updatedAt: serverTimestamp() }));
        const bobPath = doc(bob, 'users/alice/travels/trip-1');
        await assertFails(getDoc(bobPath));
        await assertFails(getDocs(collection(bob, 'users/alice/travels')));
        await assertFails(setDoc(bobPath, validTravel()));
        await assertFails(updateDoc(bobPath, { title: 'Чужое изменение', updatedAt: serverTimestamp() }));
        await assertFails(deleteDoc(bobPath));

        const guestPath = doc(guest, 'users/alice/travels/trip-1');
        await assertFails(getDoc(guestPath));
        await assertFails(setDoc(guestPath, validTravel()));

        await assertFails(setDoc(doc(alice, 'users/alice/travels/extra-field'), {
            ...validTravel(), isAdmin: true
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/travels/bad-budget'), {
            ...validTravel(), budget: { planned: 100, spent: 20 }
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/travels/negative-budget'), {
            ...validTravel(), budget: { planned: -1, spent: 20, currency: 'RUB' }
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/travels/bad-currency'), {
            ...validTravel(), budget: { planned: 100, spent: 20, currency: 'GBP' }
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/travels/bad-rating'), {
            ...validTravel(), rating: 11
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/travels/bad-photo'), {
            ...validTravel(), photos: ['http://example.test/photo.jpg']
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/travels/too-many-photos'), {
            ...validTravel(), photos: Array(11).fill('https://cdn.example.test/photo.jpg')
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/travels/forged-created'), {
            ...validTravel(), createdAt: new Date(0)
        }));
        await assertFails(updateDoc(own, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
        await assertSucceeds(deleteDoc(own));
    } finally {
        await env.cleanup();
    }
});
