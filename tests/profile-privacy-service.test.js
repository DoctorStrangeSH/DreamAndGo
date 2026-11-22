import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfilePrivacyClient } from '../js/core/profile-privacy-client.js';

test('privacy service fails closed when App Check is not initialized', async () => {
    const service = new ProfilePrivacyClient({
        firebaseApp: {},
        check: null,
        functionsFactory: () => { throw new Error('must not initialize Functions'); },
        callableFactory: () => { throw new Error('must not create callable'); }
    });
    assert.equal(service.isReady, false);
    await assert.rejects(service.updateVisibility({ profile: 'private' }), error =>
        error.code === 'app-check/not-configured');
});

test('privacy service invokes the allowlisted callable in europe-west3', async () => {
    const calls = [];
    const service = new ProfilePrivacyClient({
        firebaseApp: { name: 'app' },
        check: { name: 'app-check' },
        functionsFactory: (app, region) => {
            calls.push({ type: 'functions', app, region });
            return { name: 'functions' };
        },
        callableFactory: (functions, name) => {
            calls.push({ type: 'callable', functions, name });
            return async payload => {
                calls.push({ type: 'invoke', payload });
                return { data: { publicProfilePublished: payload.visibility.profile === 'public' } };
            };
        }
    });

    const visibility = {
        profile: 'private',
        travels: 'private',
        food: 'private',
        movies: 'private',
        books: 'private',
        dreams: 'private'
    };
    assert.equal(service.isReady, true);
    assert.deepEqual(await service.updateVisibility(visibility), {
        publicProfilePublished: false
    });
    assert.deepEqual(calls.map(call => call.type), ['functions', 'callable', 'invoke']);
    assert.equal(calls[0].region, 'europe-west3');
    assert.equal(calls[1].name, 'updateProfileVisibilityV1');
    assert.deepEqual(calls[2].payload, { visibility });
});
