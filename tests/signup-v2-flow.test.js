import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseSignupV2 } from '../js/core/signup-v2-policy.js';
import { completeSignupV2 } from '../js/core/signup-v2-flow.js';

const credentials = () => ({ uid: 'u1' });
const args = overrides => ({
    email: 'a@b.test', password: 'secret', username: 'Alice',
    createAuthUser: async () => credentials(),
    registerProfile: async () => ({ data: { username: 'alice' } }),
    deleteAuthUser: async () => {},
    signOutAuth: async () => {},
    ...overrides
});

test('signup v2 is disabled unless every rollout gate is verified', () => {
    assert.equal(canUseSignupV2(undefined), false);
    assert.equal(canUseSignupV2({ enabled: true, backendReady: true }), false);
    assert.equal(canUseSignupV2({ enabled: true, backendReady: false, legacyMigrationVerified: true }), false);
    assert.equal(canUseSignupV2({ enabled: true, backendReady: true, legacyMigrationVerified: true }), true);
});

test('successful pilot creates Auth account before invoking server registration', async () => {
    const calls = [];
    const result = await completeSignupV2(args({
        createAuthUser: async () => { calls.push('create-auth'); return credentials(); },
        registerProfile: async () => { calls.push('register-profile'); }
    }));
    assert.equal(result.success, true);
    assert.deepEqual(calls, ['create-auth', 'register-profile']);
});

test('invalid username never creates an Auth account', async () => {
    let invoked = false;
    const result = await completeSignupV2(args({
        username: 'bad name',
        createAuthUser: async () => { invoked = true; return credentials(); }
    }));
    assert.equal(result.success, false);
    assert.equal(invoked, false);
});

test('definitive nickname conflict rolls back only the just-created Auth account', async () => {
    const calls = [];
    const result = await completeSignupV2(args({
        registerProfile: async () => { throw { code: 'functions/already-exists' }; },
        deleteAuthUser: async user => { calls.push(user.uid); }
    }));
    assert.equal(result.success, false);
    assert.equal(result.recoveryRequired, undefined);
    assert.deepEqual(calls, ['u1']);
});

test('uncertain network outcome never deletes an Auth account', async () => {
    let deleted = false;
    let signedOut = false;
    const result = await completeSignupV2(args({
        registerProfile: async () => { throw { code: 'functions/unavailable' }; },
        deleteAuthUser: async () => { deleted = true; },
        signOutAuth: async () => { signedOut = true; }
    }));
    assert.equal(result.success, false);
    assert.equal(result.recoveryRequired, true);
    assert.equal(deleted, false);
    assert.equal(signedOut, true);
});

test('failed rollback requests manual recovery rather than creating duplicates', async () => {
    const result = await completeSignupV2(args({
        registerProfile: async () => { throw { code: 'functions/failed-precondition' }; },
        deleteAuthUser: async () => { throw Error('blocked'); }
    }));
    assert.equal(result.recoveryRequired, true);
});

test('Auth creation failure never calls registration or rollback', async () => {
    let registered = false;
    const result = await completeSignupV2(args({
        createAuthUser: async () => { throw { code: 'auth/email-already-in-use' }; },
        registerProfile: async () => { registered = true; }
    }));
    assert.equal(result.success, false);
    assert.equal(registered, false);
});
