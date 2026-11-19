import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeProfileLookupQuota } from '../server/profile-lookup-quota.js';

function fakeFirestore() {
    let state = null;
    const writes = [];
    const db = {
        collection(name) {
            assert.equal(name, 'profileLookupQuotas');
            return { doc(uid) { return { uid }; } };
        },
        async runTransaction(callback) {
            const tx = {
                async get(ref) {
                    assert.equal(ref.uid, 'alice');
                    return { exists: state !== null, data: () => state };
                },
                set(ref, value) {
                    assert.equal(ref.uid, 'alice');
                    state = value;
                    writes.push(value);
                }
            };
            return callback(tx);
        }
    };
    return { db, writes, getState: () => state };
}

test('profile lookup quota consumes exactly its budget and rejects overflow', async () => {
    const { db, writes, getState } = fakeFirestore();
    for (let i = 0; i < 20; i++) {
        assert.equal(await consumeProfileLookupQuota(db, 'alice', 1000 + i), true);
    }
    assert.equal(await consumeProfileLookupQuota(db, 'alice', 1100), false);
    assert.equal(getState().count, 20);
    assert.equal(writes.length, 20);
});

test('quota opens a fresh window only after its expiration', async () => {
    const { db, getState } = fakeFirestore();
    assert.equal(await consumeProfileLookupQuota(db, 'alice', 1000, 1, 60000), true);
    assert.equal(await consumeProfileLookupQuota(db, 'alice', 60999, 1, 60000), false);
    assert.equal(await consumeProfileLookupQuota(db, 'alice', 61000, 1, 60000), true);
    assert.deepEqual(getState(), { windowStartedAtMs: 61000, count: 1 });
});

test('quota rejects invalid identifiers before database access', async () => {
    const db = { collection: () => { throw Error('must not query'); } };
    await assert.rejects(consumeProfileLookupQuota(db, '../other', 1000), TypeError);
    await assert.rejects(consumeProfileLookupQuota(db, '', 1000), TypeError);
    await assert.rejects(consumeProfileLookupQuota(db, 'alice', 1000, 0), TypeError);
});
