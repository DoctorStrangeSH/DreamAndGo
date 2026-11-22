import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignupV2Client } from './signup-v2-client.js';

function setup({ registerResult, stateResult, registerError, stateError } = {}) {
    const calls = [];
    const functions = { marker: 'test-functions' };
    const httpsCallable = (instance, name) => {
        assert.equal(instance, functions);
        calls.push(name);
        if (name === 'registerProfileV2') {
            return async payload => {
                if (registerError) throw registerError;
                calls.push(payload);
                return registerResult ?? {
                    data: { username: 'dreamer_1', recovered: false }
                };
            };
        }
        if (name === 'getRegistrationStateV2') {
            return async () => {
                if (stateError) throw stateError;
                return stateResult ?? { data: { status: 'complete' } };
            };
        }
        throw new Error(`Unexpected callable: ${name}`);
    };
    return { calls, functions, httpsCallable };
}

test('client adapter validates dependencies before creating callable handles', () => {
    assert.throws(() => createSignupV2Client({}), TypeError);
    assert.throws(() => createSignupV2Client({
        functions: {},
        httpsCallable: null
    }), TypeError);
});

test('client adapter binds only the two allowlisted registration endpoints once', () => {
    const setupResult = setup();
    const client = createSignupV2Client(setupResult);
    assert.deepEqual(setupResult.calls, [
        'registerProfileV2',
        'getRegistrationStateV2'
    ]);
    assert.equal(typeof client.registerProfile, 'function');
    assert.equal(typeof client.getRegistrationState, 'function');
});

test('registration sends only the nickname and validates the canonical response', async () => {
    const setupResult = setup();
    const client = createSignupV2Client(setupResult);
    assert.deepEqual(await client.registerProfile('Dreamer_1'), {
        username: 'dreamer_1',
        recovered: false
    });
    assert.deepEqual(setupResult.calls[2], { username: 'Dreamer_1' });
});

test('registration rejects invalid nicknames before calling the backend', async () => {
    const setupResult = setup();
    const client = createSignupV2Client(setupResult);
    await assert.rejects(client.registerProfile('bad name'), error => {
        assert.equal(error.code, 'functions/invalid-argument');
        return true;
    });
    assert.equal(setupResult.calls.length, 2);
});

test('registration rejects malformed server payloads', async () => {
    const setupResult = setup({
        registerResult: { data: { username: 'someone-else', recovered: false } }
    });
    const client = createSignupV2Client(setupResult);
    await assert.rejects(client.registerProfile('Dreamer_1'), error => {
        assert.equal(error.code, 'functions/internal');
        return true;
    });
});

test('registration preserves callable errors for signup recovery policy', async () => {
    const expected = Object.assign(new Error('temporary'), {
        code: 'functions/unavailable'
    });
    const client = createSignupV2Client(setup({ registerError: expected }));
    await assert.rejects(client.registerProfile('Dreamer_1'), error => error === expected);
});

test('recovery returns only an allowlisted registration state', async () => {
    for (const status of ['complete', 'needs-profile', 'temporarily-unavailable']) {
        const client = createSignupV2Client(setup({
            stateResult: { data: { status, privateField: 'must-not-leak' } }
        }));
        assert.deepEqual(await client.getRegistrationState(), { status });
    }
});

test('recovery rejects malformed or unknown server states', async () => {
    for (const stateResult of [
        {},
        { data: { status: 'another-user-exists' } },
        { data: null }
    ]) {
        const client = createSignupV2Client(setup({ stateResult }));
        await assert.rejects(client.getRegistrationState(), error => {
            assert.equal(error.code, 'functions/internal');
            return true;
        });
    }
});

test('recovery preserves callable transport errors', async () => {
    const expected = Object.assign(new Error('offline'), {
        code: 'functions/unavailable'
    });
    const client = createSignupV2Client(setup({ stateError: expected }));
    await assert.rejects(client.getRegistrationState(), error => error === expected);
});
