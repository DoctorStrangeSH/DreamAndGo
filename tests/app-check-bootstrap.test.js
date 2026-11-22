import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeWebAppCheck } from '../js/core/app-check-bootstrap.js';

test('App Check bootstrap uses a public site key and enables token refresh', () => {
    const app = {};
    const siteKey = 'public-site-key_12345678901234567890';
    const calls = [];
    class Provider {
        constructor(key) { this.siteKey = key; }
    }

    const result = initializeWebAppCheck({
        app,
        siteKey,
        Provider,
        initializeAppCheck(target, options) {
            calls.push({ target, options });
            return { initialized: true };
        }
    });

    assert.deepEqual(result, { initialized: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].target, app);
    assert.equal(calls[0].options.provider.siteKey, siteKey);
    assert.equal(calls[0].options.isTokenAutoRefreshEnabled, true);
});

test('invalid App Check dependencies fail before provider initialization', () => {
    let initialized = false;
    const initializeAppCheck = () => {
        initialized = true;
        throw new Error('should not be called');
    };
    class Provider {}

    for (const siteKey of ['', 'invalid key', null]) {
        assert.throws(() => initializeWebAppCheck({
            app: {}, siteKey, Provider, initializeAppCheck
        }), TypeError);
    }
    assert.throws(() => initializeWebAppCheck({
        app: null,
        siteKey: 'public-site-key_12345678901234567890',
        Provider,
        initializeAppCheck
    }), TypeError);
    assert.equal(initialized, false);
});
