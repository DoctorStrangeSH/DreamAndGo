import test from 'node:test';
import assert from 'node:assert/strict';
import { completeSignupV2 } from '../js/core/signup-v2-flow.js';

function setup(overrides = {}) {
    const calls = [];
    const account = { uid: 'auth-user-1' };
    const deps = {
        email: 'person@example.com',
        password: 'long-enough-password',
        username: 'Dreamer_1',
        createAuthUser: async (email, password) => {
            calls.push(['createAuthUser', email, password]);
            return account;
        },
        registerProfile: async username => calls.push(['registerProfile', username]),
        deleteAuthUser: async user => calls.push(['deleteAuthUser', user.uid]),
        signOutAuth: async () => calls.push(['signOutAuth']),
        ...overrides
    };
    return { calls, account, deps };
}

test('invalid username is rejected before creating an Auth account', async () => {
    const { calls, deps } = setup({ username: 'not valid' });
    const result = await completeSignupV2(deps);
    assert.equal(result.success, false);
    assert.equal(calls.length, 0);
});

test('invalid dependencies and weak input fail before account creation', async () => {
    const { calls, deps } = setup({ password: '123' });
    const result = await completeSignupV2(deps);
    assert.equal(result.success, false);
    assert.equal(calls.length, 0);
});

test('Auth creation errors are returned without profile registration or rollback', async () => {
    const { calls, deps } = setup({
        createAuthUser: async () => {
            calls.push(['createAuthUser']);
            throw Object.assign(new Error('no'), { code: 'auth/email-already-in-use' });
        }
    });
    const result = await completeSignupV2(deps);
    assert.equal(result.success, false);
    assert.equal(result.code, 'auth/email-already-in-use');
    assert.deepEqual(calls, [['createAuthUser']]);
});

test('successful registration returns the created account', async () => {
    const { calls, account, deps } = setup();
    const result = await completeSignupV2(deps);
    assert.deepEqual(result, { success: true, user: account });
    assert.deepEqual(calls.map(call => call[0]), ['createAuthUser', 'registerProfile']);
});

test('definitive username conflict rolls back the newly created Auth account', async () => {
    const { calls, deps } = setup({
        registerProfile: async () => {
            calls.push(['registerProfile']);
            throw Object.assign(new Error('taken'), { code: 'functions/already-exists' });
        }
    });
    const result = await completeSignupV2(deps);
    assert.equal(result.success, false);
    assert.equal(result.code, 'functions/already-exists');
    assert.match(result.error, /Никнейм уже занят/);
    assert.deepEqual(calls.map(call => call[0]), [
        'createAuthUser', 'registerProfile', 'deleteAuthUser'
    ]);
});

test('uncertain network outcome never deletes the account and requires recovery', async () => {
    const { calls, deps } = setup({
        registerProfile: async () => {
            calls.push(['registerProfile']);
            throw Object.assign(new Error('timeout'), { code: 'functions/unavailable' });
        }
    });
    const result = await completeSignupV2(deps);
    assert.equal(result.success, false);
    assert.equal(result.recoveryRequired, true);
    assert.equal(calls.some(call => call[0] === 'deleteAuthUser'), false);
    assert.equal(calls.some(call => call[0] === 'signOutAuth'), true);
});

test('failed rollback falls back to sign-out and explicit recovery guidance', async () => {
    const { calls, deps } = setup({
        registerProfile: async () => {
            throw Object.assign(new Error('taken'), { code: 'functions/already-exists' });
        },
        deleteAuthUser: async () => {
            calls.push(['deleteAuthUser']);
            throw new Error('permission denied');
        }
    });
    const result = await completeSignupV2(deps);
    assert.equal(result.success, false);
    assert.equal(result.recoveryRequired, true);
    assert.equal(calls.some(call => call[0] === 'signOutAuth'), true);
    assert.match(result.error, /Не регистрируйся повторно/);
});

test('missing error code is treated as uncertain and never triggers destructive rollback', async () => {
    const { calls, deps } = setup({
        registerProfile: async () => { throw new Error('unknown response state'); }
    });
    const result = await completeSignupV2(deps);
    assert.equal(result.success, false);
    assert.equal(result.code, 'unknown');
    assert.equal(result.recoveryRequired, true);
    assert.equal(calls.some(call => call[0] === 'deleteAuthUser'), false);
});
