import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileAccountCallables } from './profile-account-callables.js';

class TestHttpsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function setup({ profile = {}, registryReady = true, oldReservation = true, newReservation = false } = {}) {
    const calls = [];
    const records = new Map([
        ['users/user-1', profile],
        ['system/usernameRegistry', registryReady ? { ready: true, schemaVersion: 1, legacyBackfillComplete: true } : null],
        ['usernameReservations/old_name', oldReservation ? { uid: 'user-1' } : null],
        ['usernameReservations/new_name', newReservation ? { uid: 'user-2' } : null]
    ]);
    const ref = path => ({ path });
    const db = {
        collection(name) {
            return {
                doc(id) {
                    const document = ref(`${name}/${id}`);
                    return {
                        ...document,
                        async get() {
                            const value = records.get(document.path);
                            return {
                                exists: value !== undefined && value !== null,
                                data: () => value
                            };
                        }
                    };
                }
            };
        },
        async runTransaction(callback) {
            const writes = [];
            const transaction = {
                async get(document) {
                    calls.push({ type: 'get', path: document.path });
                    const value = records.get(document.path);
                    return {
                        exists: value !== undefined && value !== null,
                        data: () => value,
                        get: key => value?.[key]
                    };
                },
                update(document, data) { writes.push({ type: 'update', path: document.path, data }); },
                set(document, data) { writes.push({ type: 'set', path: document.path, data }); },
                delete(document) { writes.push({ type: 'delete', path: document.path }); },
                create(document, data) { writes.push({ type: 'create', path: document.path, data }); }
            };
            const result = await callback(transaction);
            calls.push({ type: 'commit', writes });
            return result;
        }
    };
    const registrations = [];
    const dependencies = {
        onCall(options, handler) {
            registrations.push({ options, handler });
            return handler;
        },
        HttpsError: TestHttpsError,
        getFirestore: () => db,
        FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
        buildPublicProfile: (uid, data) => data.privacy?.profile === 'public'
            ? { uid, username: data.username, displayName: data.displayName }
            : null
    };
    return {
        calls,
        registrations,
        create: () => createProfileAccountCallables(dependencies),
        validInput: { username: 'old_name', displayName: 'Dreamer', bio: 'Hello', location: 'Berlin' }
    };
}

test('both account callables enforce App Check in europe-west3', () => {
    const ctx = setup();
    ctx.create();
    assert.equal(ctx.registrations.length, 2);
    for (const registration of ctx.registrations) {
        assert.deepEqual(registration.options, { region: 'europe-west3', enforceAppCheck: true });
    }
});

test('private profile read derives UID from auth and never accepts caller UID', async () => {
    const ctx = setup({ profile: { username: 'old_name', email: 'private@test.invalid' } });
    const callable = ctx.create().getMyProfileV1;
    await assert.rejects(callable({ auth: { uid: 'user-1' }, data: { uid: 'user-2' } }), error => error.code === 'invalid-argument');
    const result = await callable({ auth: { uid: 'user-1' }, data: {} });
    assert.equal(result.profile.email, 'private@test.invalid');
    assert.equal(ctx.calls[0].path, 'users/user-1');
});

test('private profile read rejects unauthenticated callers before database access', async () => {
    const ctx = setup();
    const callable = ctx.create().getMyProfileV1;
    await assert.rejects(callable({ data: {} }), error => error.code === 'unauthenticated');
    assert.equal(ctx.calls.length, 0);
});

test('profile update rejects unauthenticated callers and unexpected fields', async () => {
    const ctx = setup({ profile: { username: 'old_name' } });
    const callable = ctx.create().updateMyProfileV1;
    await assert.rejects(callable({ data: ctx.validInput }), error => error.code === 'unauthenticated');
    await assert.rejects(callable({
        auth: { uid: 'user-1' },
        data: { ...ctx.validInput, email: 'attacker@test.invalid' }
    }), error => error.code === 'invalid-argument');
    assert.equal(ctx.calls.length, 0);
});

test('profile update validates username and bounded text fields', async () => {
    const ctx = setup({ profile: { username: 'old_name' } });
    const callable = ctx.create().updateMyProfileV1;
    for (const input of [
        { ...ctx.validInput, username: 'bad name' },
        { ...ctx.validInput, bio: 'x'.repeat(501) },
        { ...ctx.validInput, displayName: 5 },
        { ...ctx.validInput, location: 'x'.repeat(101) }
    ]) {
        await assert.rejects(callable({ auth: { uid: 'user-1' }, data: input }), error =>
            error.code === 'invalid-argument');
    }
});

test('owner can update profile fields without changing the username registry', async () => {
    const ctx = setup({
        profile: { username: 'old_name', privacy: { profile: 'private' } }
    });
    const callable = ctx.create().updateMyProfileV1;
    const result = await callable({
        auth: { uid: 'user-1' },
        data: { ...ctx.validInput, displayName: 'New Name' }
    });
    assert.equal(result.username, 'old_name');
    assert.equal(result.publicProfileUpdated, false);
    const writes = ctx.calls.find(call => call.type === 'commit').writes;
    assert.equal(writes.length, 2);
    assert.equal(writes[0].path, 'users/user-1');
    assert.equal(writes[0].data.displayName, 'New Name');
    assert.equal(writes[1].type, 'delete');
    assert.equal(writes[1].path, 'publicProfiles/user-1');
});

test('username change atomically moves reservation and refreshes public projection', async () => {
    const ctx = setup({
        profile: {
            username: 'old_name',
            privacy: { profile: 'public' }
        }
    });
    const callable = ctx.create().updateMyProfileV1;
    const result = await callable({
        auth: { uid: 'user-1' },
        data: { ...ctx.validInput, username: 'new_name' }
    });
    assert.equal(result.username, 'new_name');
    assert.equal(result.publicProfileUpdated, true);
    const writes = ctx.calls.find(call => call.type === 'commit').writes;
    assert.equal(writes[0].type, 'update');
    assert.equal(writes[1].type, 'delete');
    assert.equal(writes[1].path, 'usernameReservations/old_name');
    assert.equal(writes[2].type, 'create');
    assert.equal(writes[2].path, 'usernameReservations/new_name');
    assert.equal(writes[3].path, 'publicProfiles/user-1');
    assert.equal(writes[3].data.username, 'new_name');
});

test('username changes fail closed until registry is fully backfilled', async () => {
    const ctx = setup({
        profile: { username: 'old_name' },
        registryReady: false
    });
    await assert.rejects(ctx.create().updateMyProfileV1({
        auth: { uid: 'user-1' },
        data: { ...ctx.validInput, username: 'new_name' }
    }), error => error.code === 'failed-precondition');
});

test('username change refuses missing ownership of the old reservation', async () => {
    const ctx = setup({
        profile: { username: 'old_name' },
        oldReservation: false
    });
    await assert.rejects(ctx.create().updateMyProfileV1({
        auth: { uid: 'user-1' },
        data: { ...ctx.validInput, username: 'new_name' }
    }), error => error.code === 'failed-precondition');
});

test('username change refuses a reservation held by another account', async () => {
    const ctx = setup({
        profile: { username: 'old_name' },
        newReservation: true
    });
    await assert.rejects(ctx.create().updateMyProfileV1({
        auth: { uid: 'user-1' },
        data: { ...ctx.validInput, username: 'new_name' }
    }), error => error.code === 'already-exists');
});

test('profile update refreshes a public projection without exposing private fields', async () => {
    const ctx = setup({
        profile: {
            username: 'old_name',
            email: 'secret@test.invalid',
            privacy: { profile: 'public' }
        }
    });
    await ctx.create().updateMyProfileV1({
        auth: { uid: 'user-1' },
        data: { ...ctx.validInput, displayName: 'Updated' }
    });
    const writes = ctx.calls.find(call => call.type === 'commit').writes;
    const publicWrite = writes.find(write => write.path === 'publicProfiles/user-1');
    assert.equal(publicWrite.data.displayName, 'Updated');
    assert.equal(publicWrite.data.email, undefined);
});

test('factory rejects missing dependencies', () => {
    assert.throws(() => createProfileAccountCallables({}), TypeError);
});
