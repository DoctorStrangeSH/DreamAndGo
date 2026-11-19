import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeWebAppCheck } from '../js/core/app-check-bootstrap.js';

test('Enterprise App Check bootstrap uses supplied public site key and token refresh', () => {
    const app = {};
    const created = [];
    class Provider { constructor(key) { this.siteKey = key; } }
    const result = initializeWebAppCheck({
        app, siteKey: '6LdTWiEuAAAAAGp17v14_t0ZlE67ha6sbDGM4KbS', Provider,
        initializeAppCheck(target, options) {
            assert.equal(target, app);
            created.push(options);
            return { ready: true };
        }
    });
    assert.deepEqual(result, { ready: true });
    assert.equal(created.length, 1);
    assert.equal(created[0].provider.siteKey, '6LdTWiEuAAAAAGp17v14_t0ZlE67ha6sbDGM4KbS');
    assert.equal(created[0].isTokenAutoRefreshEnabled, true);
});

test('App Check fails closed on invalid dependency or key', () => {
    const initializeAppCheck = () => { throw Error('must not initialize'); };
    class Provider {}
    for (const siteKey of ['', 'invalid key', null]) {
        assert.throws(() => initializeWebAppCheck({
            app: {}, siteKey, Provider, initializeAppCheck
        }), TypeError);
    }
    assert.throws(() => initializeWebAppCheck({
        app: null, siteKey: '6LdTWiEuAAAAAGp17v14_t0ZlE67ha6sbDGM4KbS',
        Provider, initializeAppCheck
    }), TypeError);
});
