import test from 'node:test';
import assert from 'node:assert/strict';
import { registerProfileWithReservedUsername } from '../server/username-reservation.js';

function fakeDb({ ready = false, legacyBackfillComplete = false } = {}) {
    const documents = new Map();
    if (ready) documents.set('system/usernameRegistry', {
        ready: true, schemaVersion: 1, legacyBackfillComplete
    });
    const ref = path => ({ path });
    const db = {
        documents,
        collection(name) {
            return { doc(id) { return ref(name + '/' + id); } };
        },
        async runTransaction(work) {
            const writes = [];
            const tx = {
                async get(document) {
                    const value = documents.get(document.path);
                    return {
                        exists: value !== undefined,
                        get(key) { return value?.[key]; }
                    };
                },
                create(document, value) { writes.push([document.path, value]); }
            };
            const result = await work(tx);
            for (const [path, value] of writes) {
                if (documents.has(path)) throw new Error('duplicate create');
                documents.set(path, value);
            }
            return result;
        }
    };
    return db;
}
const timestamp = () => 'server-time';
const signup = (db, uid, username, email = 'example@test.invalid') =>
    registerProfileWithReservedUsername(db, uid, username, email, timestamp);

test('username registry is fail-closed while migration is incomplete', async () => {
    const missing = fakeDb();
    const incomplete = fakeDb({ ready: true, legacyBackfillComplete: false });
    assert.equal((await signup(missing, 'alice', 'Alice')).code, 'failed-precondition');
    assert.equal((await signup(incomplete, 'alice', 'Alice')).code, 'failed-precondition');
    assert.equal(missing.documents.size, 0);
    assert.equal(incomplete.documents.size, 1);
});

test('normalizes case and creates private profile plus reservation atomically', async () => {
    const db = fakeDb({ ready: true, legacyBackfillComplete: true });
    const result = await signup(db, 'alice', 'Alice_1');
    assert.deepEqual(result, { ok: true, username: 'alice_1' });
    assert.equal(db.documents.get('usernameReservations/alice_1').uid, 'alice');
    const profile = db.documents.get('users/alice');
    assert.equal(profile.username, 'Alice_1');
    assert.equal(profile.usernameNormalized, 'alice_1');
    assert.equal(profile.email, 'example@test.invalid');
    assert.equal(profile.stats.friends, 0);
    assert.equal((await signup(db, 'bob', 'ALICE_1')).code, 'already-exists');
    assert.equal((await signup(db, 'alice', 'another')).code, 'already-exists');
    assert.equal(db.documents.has('users/bob'), false);
    assert.equal(db.documents.has('usernameReservations/another'), false);
});

test('rejects malformed identity and nickname without touching database', async () => {
    const db = fakeDb({ ready: true, legacyBackfillComplete: true });
    for (const [uid, username, email] of [
        ['alice', 'ab', 'a@example.test'],
        ['alice', ' aaaa ', 'a@example.test'],
        ['alice', 'a/b', 'a@example.test'],
        ['alice', 'admin@example.com', 'a@example.test'],
        ['alice/evil', 'valid', 'a@example.test'],
        ['alice', 'valid', 'missing-at-sign'],
        ['', 'valid', 'a@example.test']
    ]) {
        assert.equal((await signup(db, uid, username, email)).code, 'invalid-argument');
    }
    assert.equal(db.documents.size, 1);
});

test('never overwrites existing profile or legacy reservation', async () => {
    const db = fakeDb({ ready: true, legacyBackfillComplete: true });
    db.documents.set('users/older', { email: 'secret@example.test', username: 'legacy' });
    db.documents.set('usernameReservations/legacy', { uid: 'older' });
    assert.equal((await signup(db, 'new', 'Legacy')).code, 'already-exists');
    assert.equal((await signup(db, 'older', 'fresh')).code, 'already-exists');
    assert.equal(db.documents.get('users/older').email, 'secret@example.test');
    assert.equal(db.documents.size, 3);
});
