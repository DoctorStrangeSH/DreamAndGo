import test from 'node:test';
import assert from 'node:assert/strict';
import { getRegistrationState } from './registration-state.js';

function database({ profile, registry } = {}) {
    const reads = [];
    const db = {
        collection(name) {
            return {
                doc(id) {
                    return {
                        async get() {
                            reads.push(`${name}/${id}`);
                            const data = name === 'users' ? profile : registry;
                            return {
                                exists: data !== undefined,
                                get(field) { return data?.[field]; }
                            };
                        }
                    };
                }
            };
        }
    };
    return { db, reads };
}

test('registration state rejects invalid UIDs without reading Firestore', async () => {
    for (const uid of [null, '', '../other', 'a'.repeat(129)]) {
        const { db, reads } = database();
        assert.deepEqual(await getRegistrationState(db, uid), {
            ok: false,
            code: 'unauthenticated'
        });
        assert.equal(reads.length, 0);
    }
});

test('existing profile always reports complete without exposing profile fields', async () => {
    const { db } = database({
        profile: { email: 'private@example.com', username: 'SecretName' }
    });
    assert.deepEqual(await getRegistrationState(db, 'user-1'), {
        ok: true,
        status: 'complete'
    });
});

test('missing profile reports needs-profile only after verified registry readiness', async () => {
    const { db } = database({
        registry: { ready: true, schemaVersion: 1, legacyBackfillComplete: true }
    });
    assert.deepEqual(await getRegistrationState(db, 'user-1'), {
        ok: true,
        status: 'needs-profile'
    });
});

test('missing or incomplete registry reports temporarily-unavailable', async () => {
    for (const registry of [
        undefined,
        { ready: false, schemaVersion: 1, legacyBackfillComplete: true },
        { ready: true, schemaVersion: 2, legacyBackfillComplete: true },
        { ready: true, schemaVersion: 1, legacyBackfillComplete: false }
    ]) {
        const { db } = database({ registry });
        assert.deepEqual(await getRegistrationState(db, 'user-1'), {
            ok: true,
            status: 'temporarily-unavailable'
        });
    }
});
