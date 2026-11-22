import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileAccountClient } from '../js/core/profile-account-client.js';

function createClient({ check = {}, backendReady = true, response = { username: 'dreamer' } } = {}) {
    const calls = [];
    const client = new ProfileAccountClient({
        firebaseApp: {},
        check,
        backendReady,
        functionsFactory: (app, region) => {
            calls.push({ type: 'functions', region });
            return {};
        },
        callableFactory: (functions, name) => {
            calls.push({ type: 'callable', name });
            return async payload => {
                calls.push({ type: 'invoke', payload });
                return { data: response };
            };
        }
    });
    return { client, calls };
}

test('account client fails closed until App Check is initialized', async () => {
    const { client, calls } = createClient({ check: null });
    await assert.rejects(client.getMyProfile(), error => error.code === 'app-check/not-configured');
    assert.equal(calls.length, 0);
});

test('private profile read invokes only the current-user callable without a UID argument', async () => {
    const { client, calls } = createClient({ response: { profile: { username: 'dreamer' } } });
    assert.deepEqual(await client.getMyProfile(), { username: 'dreamer' });
    assert.deepEqual(calls, [
        { type: 'functions', region: 'europe-west3' },
        { type: 'callable', name: 'getMyProfileV1' },
        { type: 'invoke', payload: {} }
    ]);
});

test('profile update forwards only to the owner-scoped callable', async () => {
    const input = { username: 'dreamer', displayName: 'Dreamer', bio: '', location: '' };
    const { client, calls } = createClient({
        response: { username: 'dreamer', publicProfileUpdated: false }
    });
    assert.deepEqual(await client.updateMyProfile(input), {
        username: 'dreamer', publicProfileUpdated: false
    });
    assert.equal(calls[1].name, 'updateMyProfileV1');
    assert.deepEqual(calls[2].payload, input);
});

test('malformed callable responses are rejected', async () => {
    const { client } = createClient({ response: { ok: true } });
    await assert.rejects(client.getMyProfile());
    await assert.rejects(client.updateMyProfile({}));
});


test('profile callables stay closed until the Functions backend is explicitly ready', async () => {
    const { client, calls } = createClient({ backendReady: false });
    await assert.rejects(client.getMyProfile(), error => error.code === 'app-check/not-configured');
    await assert.rejects(client.updateMyProfile({
        username: 'dreamer', displayName: 'Dreamer', bio: '', location: ''
    }), error => error.code === 'app-check/not-configured');
    assert.equal(calls.length, 0);
});
