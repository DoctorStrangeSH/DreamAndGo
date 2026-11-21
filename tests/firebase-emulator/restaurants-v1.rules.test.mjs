import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const projectId = 'demo-dreamandgo-restaurants-v1';
const rules = readFileSync(new URL('./collections-v1.rules', import.meta.url), 'utf8');

const validRestaurant = () => ({
    name: 'Тёплый дом',
    cuisine: 'Русская',
    status: 'want_to_visit',
    address: 'Центр города',
    visitDate: null,
    avgBill: 2500,
    userRating: 0,
    favoriteDishes: ['Борщ', 'Пельмени'],
    review: '',
    photos: ['https://cdn.example.test/restaurant.jpg'],
    notes: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
});

test('restaurant V1 rules enforce owner CRUD, schema allowlist and timestamps', async () => {
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
        const own = doc(alice, 'users/alice/restaurants/restaurant-1');

        await assertSucceeds(setDoc(own, validRestaurant()));
        await assertSucceeds(getDoc(own));
        await assertSucceeds(getDocs(collection(alice, 'users/alice/restaurants')));
        await assertSucceeds(updateDoc(own, {
            status: 'visited',
            visitDate: '2026-11-21',
            userRating: 9,
            updatedAt: serverTimestamp()
        }));

        const bobPath = doc(bob, 'users/alice/restaurants/restaurant-1');
        await assertFails(getDoc(bobPath));
        await assertFails(getDocs(collection(bob, 'users/alice/restaurants')));
        await assertFails(setDoc(bobPath, validRestaurant()));
        await assertFails(updateDoc(bobPath, { status: 'visited', updatedAt: serverTimestamp() }));
        await assertFails(deleteDoc(bobPath));

        const guestPath = doc(guest, 'users/alice/restaurants/restaurant-1');
        await assertFails(getDoc(guestPath));
        await assertFails(setDoc(guestPath, validRestaurant()));

        await assertFails(setDoc(doc(alice, 'users/alice/restaurants/extra-field'), {
            ...validRestaurant(), isAdmin: true
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/restaurants/invalid-cuisine'), {
            ...validRestaurant(), cuisine: 'Unknown'
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/restaurants/invalid-status'), {
            ...validRestaurant(), status: 'public'
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/restaurants/invalid-date'), {
            ...validRestaurant(), visitDate: '2026-13-45'
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/restaurants/invalid-bill'), {
            ...validRestaurant(), avgBill: -1
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/restaurants/invalid-rating'), {
            ...validRestaurant(), userRating: 11
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/restaurants/too-many-dishes'), {
            ...validRestaurant(), favoriteDishes: Array(21).fill('Блюдо')
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/restaurants/too-many-photos'), {
            ...validRestaurant(), photos: Array(11).fill('https://cdn.example.test/photo.jpg')
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/restaurants/http-photo'), {
            ...validRestaurant(), photos: ['http://example.test/photo.jpg']
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/restaurants/forged-created'), {
            ...validRestaurant(), createdAt: new Date(0)
        }));
        await assertFails(updateDoc(own, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
        await assertSucceeds(deleteDoc(own));
    } finally {
        await env.cleanup();
    }
});
