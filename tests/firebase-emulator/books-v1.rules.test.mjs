import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const projectId = 'demo-dreamandgo-collections-v1';
const rules = readFileSync(new URL('./collections-v1.rules', import.meta.url), 'utf8');

const validBook = () => ({
    title: 'Книга о путешествиях',
    author: 'Автор',
    status: 'reading',
    genres: ['Путешествия' === 'Детектив' ? 'Детектив' : 'Детектив'],
    year: 2024,
    totalPages: 320,
    currentPage: 42,
    userRating: 9,
    review: 'Очень интересная книга',
    quotes: ['Первая цитата'],
    notes: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
});

test('book V1 rules enforce owner CRUD, schema allowlist and page invariants', async () => {
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
        const own = doc(alice, 'users/alice/books/book-1');

        await assertSucceeds(setDoc(own, validBook()));
        await assertSucceeds(getDoc(own));
        await assertSucceeds(getDocs(collection(alice, 'users/alice/books')));
        await assertSucceeds(updateDoc(own, { currentPage: 50, updatedAt: serverTimestamp() }));

        const bobPath = doc(bob, 'users/alice/books/book-1');
        await assertFails(getDoc(bobPath));
        await assertFails(getDocs(collection(bob, 'users/alice/books')));
        await assertFails(setDoc(bobPath, validBook()));
        await assertFails(updateDoc(bobPath, { status: 'read', updatedAt: serverTimestamp() }));
        await assertFails(deleteDoc(bobPath));

        const guestPath = doc(guest, 'users/alice/books/book-1');
        await assertFails(getDoc(guestPath));
        await assertFails(setDoc(guestPath, validBook()));

        await assertFails(setDoc(doc(alice, 'users/alice/books/extra-field'), {
            ...validBook(), isAdmin: true
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/books/invalid-status'), {
            ...validBook(), status: 'public'
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/books/invalid-genre'), {
            ...validBook(), genres: ['Неизвестный жанр']
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/books/too-many-genres'), {
            ...validBook(), genres: Array(11).fill('Детектив')
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/books/invalid-year'), {
            ...validBook(), year: 999
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/books/invalid-rating'), {
            ...validBook(), userRating: 11
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/books/page-overflow'), {
            ...validBook(), totalPages: 100, currentPage: 101
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/books/negative-pages'), {
            ...validBook(), totalPages: -1
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/books/too-many-quotes'), {
            ...validBook(), quotes: Array(31).fill('Цитата')
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/books/long-quote'), {
            ...validBook(), quotes: ['x'.repeat(501)]
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/books/forged-created'), {
            ...validBook(), createdAt: new Date(0)
        }));
        await assertFails(updateDoc(own, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
        await assertFails(updateDoc(own, { currentPage: 400, updatedAt: serverTimestamp() }));
        await assertSucceeds(deleteDoc(own));
    } finally {
        await env.cleanup();
    }
});
