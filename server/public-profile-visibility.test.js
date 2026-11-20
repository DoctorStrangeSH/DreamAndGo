import test from 'node:test';
import assert from 'node:assert/strict';
import { setPublicProfileVisibility } from '../server/public-profile-visibility.js';

function fixture({ ready = true, reservedUid = 'alice', enabled = false } = {}) {
    const writes = [];
    const reads = [];
    const docs = {
        'users/alice': { exists: true, data: { username: 'sherlock', usernameNormalized: 'sherlock', publicProfileEnabled: enabled } },
        'system/usernameRegistry': { exists: ready, data: { ready, schemaVersion: 1, legacyBackfillComplete: ready } },
        'usernameReservations/sherlock': { exists: !!reservedUid, data: { uid: reservedUid } }
    };
    const ref = path => ({ path });
    const db = {
        collection(name) {
            return { doc(id) { return ref(`${name}/${id}`); } };
        },
        async runTransaction(callback) {
            const tx = {
                async get(document) {
                    reads.push(document.path);
                    const record = docs[document.path];
                    return {
                        exists: !!record?.exists,
                        get: key => record?.data?.[key],
                    };
                },
                update(document, data) {
                    writes.push({ path: document.path, data });
                }
            };
            return callback(tx);
        }
    };
    return { db, writes, reads };
}

const timestamp = () => 'SERVER_TIMESTAMP';

test('owner can disable visibility immediately, without registry readiness', async () => {
    const { db, writes } = fixture({ ready: false, enabled: true });
    assert.deepEqual(await setPublicProfileVisibility(db, 'alice', false, timestamp),
        { ok: true, enabled: false });
    assert.deepEqual(writes, [{
        path: 'users/alice',
        data: { publicProfileEnabled: false, publicProfileUpdatedAt: 'SERVER_TIMESTAMP' }
    }]);
});

test('enabling visibility requires completed registry and a reservation owned by caller', async () => {
    const blocked = fixture({ ready: false });
    assert.deepEqual(await setPublicProfileVisibility(blocked.db, 'alice', true, timestamp),
        { ok: false, code: 'failed-precondition' });
    assert.deepEqual(blocked.writes, []);

    const collision = fixture({ ready: true, reservedUid: 'bob' });
    assert.deepEqual(await setPublicProfileVisibility(collision.db, 'alice', true, timestamp),
        { ok: false, code: 'failed-precondition' });
    assert.deepEqual(collision.writes, []);

    const valid = fixture({ ready: true, reservedUid: 'alice' });
    assert.deepEqual(await setPublicProfileVisibility(valid.db, 'alice', true, timestamp),
        { ok: true, enabled: true });
    assert.deepEqual(valid.writes, [{
        path: 'users/alice',
        data: { publicProfileEnabled: true, publicProfileUpdatedAt: 'SERVER_TIMESTAMP' }
    }]);
});

test('invalid input and missing owner profile fail closed', async () => {
    const { db } = fixture();
    assert.deepEqual(await setPublicProfileVisibility(db, 'alice', 'true', timestamp),
        { ok: false, code: 'invalid-argument' });
    assert.deepEqual(await setPublicProfileVisibility(db, 'bad/id', true, timestamp),
        { ok: false, code: 'invalid-argument' });
    const missing = fixture();
    missing.db.runTransaction = async callback => callback({
        get: async () => ({ exists: false }),
        update() { throw new Error('must not write'); }
    });
    assert.deepEqual(await setPublicProfileVisibility(missing.db, 'alice', false, timestamp),
        { ok: false, code: 'not-found' });
});
