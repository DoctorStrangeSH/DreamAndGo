import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStagingConfig, FLAG_NAMES } from '../scripts/staging-preflight.mjs';

function validConfig() {
    return {
        firebaseConfig: {
            projectId: 'dreamandgo-staging',
            apiKey: 'AIza' + 'A'.repeat(32),
            authDomain: 'dreamandgo-staging.firebaseapp.com',
            appId: '1:123456789:web:abc123',
            messagingSenderId: '123456789',
            storageBucket: 'dreamandgo-staging.firebasestorage.app'
        },
        appCheckSiteKey: 'sitekey' + 'A'.repeat(32),
        rolloutFlags: Object.fromEntries(FLAG_NAMES.map(name => [name, false]))
    };
}

test('staging preflight accepts a separate project with all rollout switches closed', () => {
    assert.deepEqual(validateStagingConfig(validConfig()), { valid: true, errors: [] });
});

test('staging preflight rejects production and demo project IDs', () => {
    for (const projectId of ['dream-and-go', 'demo-dream-and-go', 'dreamandgo-prod']) {
        const config = validConfig();
        config.firebaseConfig.projectId = projectId;
        config.firebaseConfig.authDomain = `${projectId}.firebaseapp.com`;
        assert.equal(validateStagingConfig(config).valid, false);
    }
});

test('staging preflight rejects cross-project authDomain, production bucket and databaseURL', () => {
    const config = validConfig();
    config.firebaseConfig.authDomain = 'dream-and-go.firebaseapp.com';
    config.firebaseConfig.storageBucket = 'dream-and-go.firebasestorage.app';
    config.firebaseConfig.databaseURL = 'https://dream-and-go-default-rtdb.firebaseio.com';
    const result = validateStagingConfig(config);
    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 3);
});

test('staging project with production-like prefix does not confuse RTDB host safety', () => {
    const config = validConfig();
    config.firebaseConfig.projectId = 'dream-and-go-staging';
    config.firebaseConfig.authDomain = 'dream-and-go-staging.firebaseapp.com';
    config.firebaseConfig.storageBucket = 'dream-and-go-staging.firebasestorage.app';
    config.firebaseConfig.databaseURL = 'https://dream-and-go-staging-default-rtdb.europe-west1.firebasedatabase.app';
    assert.equal(validateStagingConfig(config).valid, true);

    config.firebaseConfig.databaseURL = 'https://dream-and-go-default-rtdb.europe-west1.firebasedatabase.app';
    assert.equal(validateStagingConfig(config).valid, false);
});

test('staging preflight rejects storage and Realtime Database endpoints from another project', () => {
    const config = validConfig();
    config.firebaseConfig.storageBucket = 'unrelated-staging.firebasestorage.app';
    assert.equal(validateStagingConfig(config).valid, false);

    config.firebaseConfig.storageBucket = 'dreamandgo-staging.firebasestorage.app';
    config.firebaseConfig.databaseURL = 'https://unrelated-staging-default-rtdb.europe-west1.firebasedatabase.app';
    assert.equal(validateStagingConfig(config).valid, false);
});

test('staging preflight rejects malformed optional endpoint values and non-origin database URLs', () => {
    const nonStringDatabase = validConfig();
    nonStringDatabase.firebaseConfig.databaseURL = 123;
    assert.equal(validateStagingConfig(nonStringDatabase).valid, false);

    const nonStringBucket = validConfig();
    nonStringBucket.firebaseConfig.storageBucket = 123;
    assert.equal(validateStagingConfig(nonStringBucket).valid, false);

    for (const databaseURL of [
        'http://dreamandgo-staging-default-rtdb.europe-west1.firebasedatabase.app',
        'https://user@dreamandgo-staging-default-rtdb.europe-west1.firebasedatabase.app',
        'https://dreamandgo-staging-default-rtdb.europe-west1.firebasedatabase.app/unexpected',
        'https://dreamandgo-staging-default-rtdb.europe-west1.firebasedatabase.app?redirect=1'
    ]) {
        const config = validConfig();
        config.firebaseConfig.databaseURL = databaseURL;
        assert.equal(validateStagingConfig(config).valid, false, databaseURL);
    }
});

test('staging preflight requires every rollout switch to be explicitly false', () => {
    for (const name of FLAG_NAMES) {
        const config = validConfig();
        config.rolloutFlags[name] = true;
        assert.equal(validateStagingConfig(config).valid, false);
        delete config.rolloutFlags[name];
        assert.equal(validateStagingConfig(config).valid, false);
    }
});

test('staging preflight rejects missing App Check, malformed web config and invalid input', () => {
    const config = validConfig();
    config.appCheckSiteKey = '';
    config.firebaseConfig.appId = 'not-a-web-app';
    assert.equal(validateStagingConfig(config).valid, false);
    assert.equal(validateStagingConfig(null).valid, false);
    assert.equal(validateStagingConfig({}).valid, false);
});
