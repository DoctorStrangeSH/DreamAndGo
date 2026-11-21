import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import {
    validateTravelInput,
    validateBookInput,
    validateMovieInput,
    validateRestaurantInput
} from '../../js/core/collection-input-policy.js';
import { validateDreamInput } from '../../js/core/dream-input-policy.js';

const projectId = 'demo-dreamandgo-client-rules-contract';
const rules = readFileSync(new URL('./collections-v1.rules', import.meta.url), 'utf8');

test('client create payloads for all five collections are accepted by the V1 Rules contract', async () => {
    assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run with Firebase Firestore emulator');
    const env = await initializeTestEnvironment({ projectId, firestore: { rules } });
    try {
        await env.withSecurityRulesDisabled(async ctx => {
            await setDoc(doc(ctx.firestore(), 'users/alice'), {
                email: 'alice@example.test',
                username: 'alice',
                createdAt: new Date(),
                updatedAt: new Date()
            });
        });

        const db = env.authenticatedContext('alice').firestore();
        const timestampFields = {
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        const clientCreates = [
            ['dreams', 'dream-client-contract', {
                ...validateDreamInput({
                    title: 'Освоить новый навык',
                    category: 'Знания',
                    status: 'dreaming',
                    description: 'Учиться постепенно',
                    progress: 0,
                    deadline: null,
                    steps: []
                }),
                ...timestampFields
            }],
            ['travels', 'travel-client-contract', {
                ...validateTravelInput({
                    title: 'Поездка в горы',
                    type: 'mountains',
                    status: 'planned',
                    location: 'Алтай',
                    description: 'Летний маршрут',
                    budget: { planned: 50000, spent: 0, currency: 'RUB' },
                    rating: 0,
                    notes: '',
                    photos: []
                }),
                ...timestampFields
            }],
            ['books', 'book-client-contract', {
                ...validateBookInput({
                    title: 'Дюна',
                    author: 'Фрэнк Герберт',
                    status: 'want_to_read',
                    genres: ['Фантастика'],
                    year: 1965,
                    totalPages: 500,
                    currentPage: 0,
                    userRating: 0,
                    review: '',
                    quotes: []
                }),
                notes: '',
                ...timestampFields
            }],
            ['movies', 'movie-client-contract', {
                ...validateMovieInput({
                    movieId: 550,
                    title: 'Бойцовский клуб',
                    originalTitle: 'Fight Club',
                    overview: 'Описание',
                    poster: null,
                    backdrop: null,
                    voteAverage: 8.4,
                    voteCount: 1000,
                    rating: 4,
                    releaseDate: '1999-10-15',
                    genreIds: [18, 53],
                    runtime: 139,
                    tagline: '',
                    budget: 63000000,
                    productionCountries: [{ iso_3166_1: 'US', name: 'United States' }],
                    status: 'to_watch',
                    userRating: 0,
                    review: ''
                }),
                notes: '',
                ...timestampFields
            }],
            ['restaurants', 'restaurant-client-contract', {
                ...validateRestaurantInput({
                    name: 'Тёплый дом',
                    cuisine: 'Русская',
                    status: 'want_to_visit',
                    address: 'Центр города',
                    visitDate: null,
                    avgBill: 2500,
                    userRating: 0,
                    favoriteDishes: ['Борщ'],
                    review: '',
                    photos: []
                }),
                notes: '',
                ...timestampFields
            }]
        ];

        for (const [collectionName, documentId, payload] of clientCreates) {
            await assertSucceeds(
                setDoc(doc(db, 'users/alice', collectionName, documentId), payload),
                `Client payload for ${collectionName} must satisfy Firestore Rules`
            );
        }
    } finally {
        await env.cleanup();
    }
});
