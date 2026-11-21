import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const projectId = 'demo-dreamandgo-movies-v1';
const rules = readFileSync(new URL('./collections-v1.rules', import.meta.url), 'utf8');

const validMovie = () => ({
    movieId: 550,
    title: 'Бойцовский клуб',
    originalTitle: 'Fight Club',
    overview: 'Описание фильма',
    poster: null,
    backdrop: 'https://image.tmdb.org/t/p/w1280/example.jpg',
    voteAverage: 8.4,
    voteCount: 25000,
    rating: 8,
    releaseDate: '1999-10-15',
    genreIds: [18, 53],
    runtime: 139,
    tagline: 'Первое правило',
    budget: 63000000,
    productionCountries: [{ iso_3166_1: 'US', name: 'United States' }],
    status: 'to_watch',
    userRating: 5,
    review: '',
    notes: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
});

test('movie V1 rules enforce owner CRUD, TMDB schema and timestamps', async () => {
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
        const own = doc(alice, 'users/alice/movies/movie-1');

        await assertSucceeds(setDoc(own, validMovie()));
        await assertSucceeds(getDoc(own));
        await assertSucceeds(getDocs(collection(alice, 'users/alice/movies')));
        await assertSucceeds(updateDoc(own, { status: 'watched', userRating: 4, updatedAt: serverTimestamp() }));

        const bobPath = doc(bob, 'users/alice/movies/movie-1');
        await assertFails(getDoc(bobPath));
        await assertFails(getDocs(collection(bob, 'users/alice/movies')));
        await assertFails(setDoc(bobPath, validMovie()));
        await assertFails(updateDoc(bobPath, { status: 'watched', updatedAt: serverTimestamp() }));
        await assertFails(deleteDoc(bobPath));

        const guestPath = doc(guest, 'users/alice/movies/movie-1');
        await assertFails(getDoc(guestPath));
        await assertFails(setDoc(guestPath, validMovie()));

        await assertFails(setDoc(doc(alice, 'users/alice/movies/extra-field'), {
            ...validMovie(), isAdmin: true
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/movies/invalid-id'), {
            ...validMovie(), movieId: -1
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/movies/invalid-status'), {
            ...validMovie(), status: 'public'
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/movies/invalid-genre'), {
            ...validMovie(), genreIds: [999999]
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/movies/too-many-genres'), {
            ...validMovie(), genreIds: Array(21).fill(18)
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/movies/invalid-country'), {
            ...validMovie(), productionCountries: [{ iso_3166_1: 'USA', name: 'United States' }]
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/movies/extra-country-field'), {
            ...validMovie(), productionCountries: [{ iso_3166_1: 'US', name: 'United States', admin: true }]
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/movies/too-many-countries'), {
            ...validMovie(), productionCountries: Array(31).fill({ iso_3166_1: 'US', name: 'United States' })
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/movies/http-poster'), {
            ...validMovie(), poster: 'http://example.test/poster.jpg'
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/movies/bad-date'), {
            ...validMovie(), releaseDate: '1999-13-45'
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/movies/impossible-date'), {
            ...validMovie(), releaseDate: '2026-02-30'
        }));
        await assertSucceeds(setDoc(doc(alice, 'users/alice/movies/leap-day'), {
            ...validMovie(), releaseDate: '2028-02-29'
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/movies/bad-rating'), {
            ...validMovie(), userRating: 6
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/movies/negative-budget'), {
            ...validMovie(), budget: -1
        }));
        await assertFails(setDoc(doc(alice, 'users/alice/movies/forged-created'), {
            ...validMovie(), createdAt: new Date(0)
        }));
        await assertFails(updateDoc(own, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
        await assertSucceeds(deleteDoc(own));
    } finally {
        await env.cleanup();
    }
});
