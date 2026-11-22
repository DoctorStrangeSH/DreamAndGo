import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistrationCallables } from './registration-callables.js';

class TestHttpsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function setup(overrides = {}) {
    const calls = [];
    const fakeDb = { name: 'fake-db' };
    const account = { uid: 'user-1', email: 'person@example.com', disabled: false };
    const dependencies = {
        onCall(options, handler) {
            calls.push({ options, handler });
            return handler;
        },
        HttpsError: TestHttpsError,
        getAuth: () => ({ getUser: async uid => {
            assert.equal(uid, 'user-1');
            return account;
        } }),
        getFirestore: () => fakeDb,
        FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
        registerProfileWithReservedUsername: async (...args) => {
            calls.push({ registrationArgs: args });
            return { ok: true, username: 'dreamer_1', recovered: false };
        },
        getRegistrationState: async () => ({ ok: true, status: 'complete' }),
        ...overrides
    };
    return { calls, fakeDb, account, dependencies };
}

test('registration endpoints require App Check and use the fixed europe-west3 region', () => {
    const { calls, dependencies } = setup();
    createRegistrationCallables(dependencies);
    assert.equal(calls.length, 2);
    for (const call of calls) {
        assert.deepEqual(call.options, {
            region: 'europe-west3',
            enforceAppCheck: true
        });
    }
});

test('registration requires an authenticated UID before accessing Auth or Firestore', async () => {
    let authLookups = 0;
    const { dependencies } = setup({
        getAuth: () => {
            authLookups += 1;
            return { getUser: async () => ({ email: 'x@y.z' }) };
        }
    });
    const { registerProfileV2 } = createRegistrationCallables(dependencies);
    await assert.rejects(registerProfileV2({ data: { username: 'Dreamer_1' } }), error => {
        assert.equal(error.code, 'unauthenticated');
        return true;
    });
    assert.equal(authLookups, 0);
});

test('registration rejects malformed UID paths', async () => {
    const { dependencies } = setup();
    const { registerProfileV2 } = createRegistrationCallables(dependencies);
    await assert.rejects(registerProfileV2({
        auth: { uid: '../other' },
        data: { username: 'Dreamer_1' }
    }), error => error.code === 'unauthenticated');
});

test('registration verifies the Auth account and never trusts a client email', async () => {
    const { calls, fakeDb, dependencies } = setup();
    const { registerProfileV2 } = createRegistrationCallables(dependencies);
    const result = await registerProfileV2({
        auth: { uid: 'user-1', token: { email: 'attacker@example.com' } },
        data: { username: 'Dreamer_1', email: 'attacker@example.com' }
    });

    assert.deepEqual(result, { username: 'dreamer_1', recovered: false });
    const args = calls.find(call => call.registrationArgs)?.registrationArgs;
    assert.equal(args[0], fakeDb);
    assert.equal(args[1], 'user-1');
    assert.equal(args[2], 'Dreamer_1');
    assert.equal(args[3], 'person@example.com');
    assert.equal(args[4](), 'SERVER_TIMESTAMP');
});

test('registration rejects missing email and disabled Auth accounts', async () => {
    for (const account of [
        { uid: 'user-1', email: null, disabled: false },
        { uid: 'user-1', email: 'person@example.com', disabled: true }
    ]) {
        const { dependencies } = setup({
            getAuth: () => ({ getUser: async () => account })
        });
        const { registerProfileV2 } = createRegistrationCallables(dependencies);
        await assert.rejects(registerProfileV2({
            auth: { uid: 'user-1' },
            data: { username: 'Dreamer_1' }
        }), error => error.code === 'failed-precondition');
    }
});

test('registration maps registry conflicts and incomplete migration to safe errors', async () => {
    for (const [result, expected] of [
        [{ ok: false, code: 'already-exists' }, 'already-exists'],
        [{ ok: false, code: 'failed-precondition' }, 'failed-precondition'],
        [{ ok: false, code: 'invalid-argument' }, 'invalid-argument']
    ]) {
        const { dependencies } = setup({
            registerProfileWithReservedUsername: async () => result
        });
        const { registerProfileV2 } = createRegistrationCallables(dependencies);
        await assert.rejects(registerProfileV2({
            auth: { uid: 'user-1' },
            data: { username: 'Dreamer_1' }
        }), error => error.code === expected);
    }
});

test('registration does not expose unexpected internal helper errors', async () => {
    const { dependencies } = setup({
        registerProfileWithReservedUsername: async () => {
            throw new Error('database internals');
        }
    });
    const { registerProfileV2 } = createRegistrationCallables(dependencies);
    await assert.rejects(registerProfileV2({
        auth: { uid: 'user-1' },
        data: { username: 'Dreamer_1' }
    }), error => {
        assert.equal(error.code, 'internal');
        return true;
    });
});

test('registration recovery returns only an allowlisted state', async () => {
    const { dependencies } = setup({
        getRegistrationState: async (_db, uid) => {
            assert.equal(uid, 'user-1');
            return { ok: true, status: 'needs-profile' };
        }
    });
    const { getRegistrationStateV2 } = createRegistrationCallables(dependencies);
    assert.deepEqual(await getRegistrationStateV2({ auth: { uid: 'user-1' } }), {
        status: 'needs-profile'
    });
});

test('registration recovery rejects unauthenticated and unexpected states', async () => {
    const { dependencies } = setup({
        getRegistrationState: async () => ({ ok: true, status: 'private-email-leaked' })
    });
    const { getRegistrationStateV2 } = createRegistrationCallables(dependencies);
    await assert.rejects(getRegistrationStateV2({}), error => error.code === 'unauthenticated');
    await assert.rejects(getRegistrationStateV2({ auth: { uid: 'user-1' } }), error => error.code === 'internal');
});

test('factory rejects missing dependencies instead of exposing partially configured endpoints', () => {
    assert.throws(() => createRegistrationCallables({}), TypeError);
});
