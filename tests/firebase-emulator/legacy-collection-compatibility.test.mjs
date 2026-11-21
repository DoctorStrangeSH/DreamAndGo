import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
    collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, serverTimestamp, updateDoc
} from 'firebase/firestore';

const projectId = 'demo-dreamandgo-legacy-compatibility';
const rules = readFileSync(new URL('./collections-v1.rules', import.meta.url), 'utf8');

const legacyDocuments = [
    ['dreams', 'dream-legacy', { title: 'Старая мечта', status: 'active', description: 'Историческая запись' }],
    ['travels', 'travel-legacy', { title: 'Старая поездка', status: 'finished', city: 'Казань' }],
    ['books', 'book-legacy', { title: 'Старая книга', author: 'Неизвестен', status: 'finished', pages: 240 }],
    ['movies', 'movie-legacy', { title: 'Старый фильм', status: 'completed', tmdbId: 550 }],
    ['restaurants', 'restaurant-legacy', { name: 'Старый ресторан', status: 'visited', rating: 5 }]
];

test('legacy collection documents remain readable and deletable but require migration before strict V1 updates', async () => {
    assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run with Firebase Firestore emulator');
    const env = await initializeTestEnvironment({ projectId, firestore: { rules } });
    try {
        await env.withSecurityRulesDisabled(async ctx => {
            const db = ctx.firestore();
            await setDoc(doc(db, 'users/alice'), { email: 'alice@example.test', username: 'alice' });
            for (const [name, id, data] of legacyDocuments) {
                // Deliberately model historical shape: no createdAt/updatedAt,
                // old status values and fields outside the V1 write allowlist.
                await setDoc(doc(db, 'users/alice', name, id), data);
            }
        });

        const db = env.authenticatedContext('alice').firestore();
        for (const [name, id] of legacyDocuments) {
            const reference = doc(db, 'users/alice', name, id);
            await assertSucceeds(getDoc(reference), `Owner can read legacy ${name} record by ID`);

            // orderBy(createdAt) excludes documents that do not contain createdAt.
            const ordered = await assertSucceeds(
                getDocs(query(collection(db, 'users/alice', name), orderBy('createdAt', 'desc')))
            );
            assert.equal(ordered.docs.some(item => item.id === id), false,
                `Legacy ${name} record without createdAt is absent from the service's ordered list query`);

            await assertFails(
                updateDoc(reference, { updatedAt: serverTimestamp() }),
                `Strict V1 Rules must not silently accept incomplete legacy ${name} payloads`
            );
            await assertSucceeds(deleteDoc(reference),
                `Owner retains delete access for legacy ${name} record`);
        }
    } finally {
        await env.cleanup();
    }
});
