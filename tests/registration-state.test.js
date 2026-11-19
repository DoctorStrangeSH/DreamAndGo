import test from 'node:test';
import assert from 'node:assert/strict';
import { getRegistrationState } from '../server/registration-state.js';

function fakeDb({ profile, registry } = {}) {
    const documents = new Map();
    if (profile) documents.set('users/alice', profile);
    if (registry) documents.set('system/usernameRegistry', registry);
    return {
        collection(collection) {
            return {
                doc(id) {
                    return {
                        async get() {
                            const value = documents.get(collection + '/' + id);
                            return {
                                exists: Boolean(value),
                                get(name) { return value?.[name]; }
                            };
                        }
                    };
                }
            };
        }
    };
}
const ready = { ready: true, schemaVersion: 1, legacyBackfillComplete: true };

test('existing profile is complete and never exposed in response', async () => {
    const db = fakeDb({
        profile: { email: 'private@example.test', username: 'Alice', role: 'admin' }
    });
    const result = await getRegistrationState(db, 'alice');
    assert.deepEqual(result, { ok: true, status: 'complete' });
    assert.equal(JSON.stringify(result).includes('private@'), false);
});

test('Auth-only account reports recovery only after migration gate opens', async () => {
    assert.deepEqual(await getRegistrationState(fakeDb({ registry: ready }), 'alice'), {
        ok: true, status: 'needs-profile'
    });
    assert.deepEqual(await getRegistrationState(fakeDb(), 'alice'), {
        ok: true, status: 'temporarily-unavailable'
    });
    assert.deepEqual(await getRegistrationState(fakeDb({
        registry: { ...ready, legacyBackfillComplete: false }
    }), 'alice'), { ok: true, status: 'temporarily-unavailable' });
});

test('never accepts another identity or malformed account id', async () => {
    for (const uid of [null, '', 'bad/uid', 'x'.repeat(129)]) {
        const result = await getRegistrationState(fakeDb({ registry: ready }), uid);
        assert.deepEqual(result, { ok: false, code: 'unauthenticated' });
    }
});
