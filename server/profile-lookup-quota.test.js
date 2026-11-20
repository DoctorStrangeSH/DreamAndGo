import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeProfileLookupQuota } from './profile-lookup-quota.js';

function fixture(initial = null) {
    let stored = initial;
    const writes = [];
    const paths = [];
    const db = {
        collection(name) {
            assert.equal(name, 'profileLookupQuotas');
            return {
                doc(uid) {
                    paths.push(`${name}/${uid}`);
                    return { path: `${name}/${uid}` };
                }
            };
        },
        async runTransaction(callback) {
            return callback({
                async get(ref) {
                    return {
                        exists: stored !== null,
                        data: () => stored
                    };
                },
                set(ref, value) {
                    writes.push({ path: ref.path, value });
                    stored = value;
                }
            });
        }
    };
    return { db, writes, paths, get stored() { return stored; } };
}

test('profile lookup quota increments atomically and denies requests above the limit', async () => {
    const state = fixture();
    assert.equal(await consumeProfileLookupQuota(state.db, 'alice', 100_000, 2, 60_000), true);
    assert.equal(state.stored.count, 1);
    assert.equal(await consumeProfileLookupQuota(state.db, 'alice', 100_001, 2, 60_000), true);
    assert.equal(state.stored.count, 2);
    assert.equal(await consumeProfileLookupQuota(state.db, 'alice', 100_002, 2, 60_000), false);
    assert.equal(state.stored.count, 2);
    assert.deepEqual(state.paths, ['profileLookupQuotas/alice', 'profileLookupQuotas/alice', 'profileLookupQuotas/alice']);
});

test('quota window expires at the exact boundary and starts a fresh counter', async () => {
    const state = fixture({ windowStartedAtMs: 100_000, count: 20 });
    assert.equal(await consumeProfileLookupQuota(state.db, 'alice', 160_000), true);
    assert.deepEqual(state.stored, { windowStartedAtMs: 160_000, count: 1 });
});

test('future or malformed quota state fails closed by resetting the window', async () => {
    for (const initial of [
        { windowStartedAtMs: 200_000, count: 19 },
        { windowStartedAtMs: 100_000, count: -1 },
        { windowStartedAtMs: 100_000, count: '19' },
        { windowStartedAtMs: '100000', count: 19 }
    ]) {
        const state = fixture(initial);
        assert.equal(await consumeProfileLookupQuota(state.db, 'alice', 150_000), true);
        assert.deepEqual(state.stored, { windowStartedAtMs: 150_000, count: 1 });
    }
});

test('quotas are isolated by authenticated user ID', async () => {
    const state = fixture();
    await consumeProfileLookupQuota(state.db, 'alice', 100_000);
    await consumeProfileLookupQuota(state.db, 'bob', 100_000);
    assert.deepEqual(state.paths, ['profileLookupQuotas/alice', 'profileLookupQuotas/bob']);
});

test('invalid quota inputs are rejected before Firestore access', async () => {
    const state = fixture();
    await assert.rejects(consumeProfileLookupQuota(state.db, 'bad/id', 100_000), TypeError);
    await assert.rejects(consumeProfileLookupQuota(state.db, 'alice', NaN), TypeError);
    await assert.rejects(consumeProfileLookupQuota(state.db, 'alice', 100_000, 0), TypeError);
    await assert.rejects(consumeProfileLookupQuota(state.db, 'alice', 100_000, 20, 999), TypeError);
    assert.deepEqual(state.paths, []);
});
