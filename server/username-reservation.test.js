import test from 'node:test';
import assert from 'node:assert/strict';
import { registerProfileWithReservedUsername } from './username-reservation.js';

function createDatabase(seed = {}) {
    const records = new Map(Object.entries(seed));
    const writes = [];
    const reads = [];
    const db = {
        collection(name) {
            return {
                doc(id) {
                    const key = `${name}/${id}`;
                    return { key, collection: name, id };
                }
            };
        },
        async runTransaction(callback) {
            let writeStarted = false;
            const transaction = {
                async get(ref) {
                    assert.equal(writeStarted, false, 'transaction reads must precede writes');
                    reads.push(ref.key);
                    const data = records.get(ref.key);
                    return {
                        exists: data !== undefined,
                        get(field) { return data?.[field]; }
                    };
                },
                create(ref, data) {
                    writeStarted = true;
                    assert.equal(records.has(ref.key), false, `document already exists: ${ref.key}`);
                    writes.push({ key: ref.key, data });
                    records.set(ref.key, data);
                }
            };
            return callback(transaction);
        }
    };
    return { db, records, writes, reads };
}

const readyRegistry = {
    ready: true,
    schemaVersion: 1,
    legacyBackfillComplete: true
};
const stamp = () => 'SERVER_TIMESTAMP';

test('invalid registration input is rejected before transaction access', async () => {
    const { db, reads, writes } = createDatabase();
    const result = await registerProfileWithReservedUsername(
        db, 'uid-1', 'bad name', 'person@example.com', stamp
    );
    assert.deepEqual(result, { ok: false, code: 'invalid-argument' });
    assert.equal(reads.length, 0);
    assert.equal(writes.length, 0);
});

test('missing or incomplete registry fails closed without writes', async () => {
    for (const state of [
        undefined,
        { ready: true, schemaVersion: 1, legacyBackfillComplete: false },
        { ready: false, schemaVersion: 1, legacyBackfillComplete: true },
        { ready: true, schemaVersion: 2, legacyBackfillComplete: true }
    ]) {
        const seed = state ? { 'system/usernameRegistry': state } : {};
        const { db, writes } = createDatabase(seed);
        const result = await registerProfileWithReservedUsername(
            db, 'uid-1', 'Dreamer_1', 'person@example.com', stamp
        );
        assert.deepEqual(result, { ok: false, code: 'failed-precondition' });
        assert.equal(writes.length, 0);
    }
});

test('successful registration atomically reserves canonical nickname and creates profile', async () => {
    const { db, records, writes, reads } = createDatabase({
        'system/usernameRegistry': readyRegistry
    });
    const result = await registerProfileWithReservedUsername(
        db, 'uid-1', 'Dreamer_1', 'person@example.com', stamp
    );

    assert.deepEqual(result, { ok: true, username: 'dreamer_1' });
    assert.deepEqual(reads, [
        'system/usernameRegistry',
        'usernameReservations/dreamer_1',
        'users/uid-1'
    ]);
    assert.deepEqual(writes.map(write => write.key), [
        'usernameReservations/dreamer_1',
        'users/uid-1'
    ]);
    assert.equal(records.get('usernameReservations/dreamer_1').uid, 'uid-1');

    const profile = records.get('users/uid-1');
    assert.equal(profile.username, 'Dreamer_1');
    assert.equal(profile.usernameNormalized, 'dreamer_1');
    assert.equal(profile.email, 'person@example.com');
    assert.equal(profile.preferences.language, 'ru');
    assert.equal(profile.stats.travels, 0);
});

test('a username reservation owned by another UID blocks registration', async () => {
    const { db, writes } = createDatabase({
        'system/usernameRegistry': readyRegistry,
        'usernameReservations/dreamer_1': { uid: 'other-user' }
    });
    const result = await registerProfileWithReservedUsername(
        db, 'uid-1', 'Dreamer_1', 'person@example.com', stamp
    );
    assert.deepEqual(result, { ok: false, code: 'already-exists' });
    assert.equal(writes.length, 0);
});

test('existing profile without its matching reservation is not silently repaired', async () => {
    const { db, writes } = createDatabase({
        'system/usernameRegistry': readyRegistry,
        'users/uid-1': {
            username: 'Dreamer_1',
            usernameNormalized: 'dreamer_1'
        }
    });
    const result = await registerProfileWithReservedUsername(
        db, 'uid-1', 'Dreamer_1', 'person@example.com', stamp
    );
    assert.deepEqual(result, { ok: false, code: 'already-exists' });
    assert.equal(writes.length, 0);
});

test('retry after a committed registration is idempotently recovered', async () => {
    const { db, writes } = createDatabase({
        'system/usernameRegistry': readyRegistry,
        'usernameReservations/dreamer_1': { uid: 'uid-1' },
        'users/uid-1': {
            username: 'Dreamer_1',
            usernameNormalized: 'dreamer_1'
        }
    });
    const result = await registerProfileWithReservedUsername(
        db, 'uid-1', 'Dreamer_1', 'person@example.com', stamp
    );
    assert.deepEqual(result, {
        ok: true,
        username: 'dreamer_1',
        recovered: true
    });
    assert.equal(writes.length, 0);
});

test('an existing Auth UID cannot claim a different username', async () => {
    const { db, writes } = createDatabase({
        'system/usernameRegistry': readyRegistry,
        'usernameReservations/oldname': { uid: 'uid-1' },
        'users/uid-1': {
            username: 'OldName',
            usernameNormalized: 'oldname'
        }
    });
    const result = await registerProfileWithReservedUsername(
        db, 'uid-1', 'NewName', 'person@example.com', stamp
    );
    assert.deepEqual(result, { ok: false, code: 'already-exists' });
    assert.equal(writes.length, 0);
});
