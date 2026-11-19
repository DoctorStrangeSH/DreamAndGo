import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryRouteRedirect } from '../js/core/registration-recovery-route.js';

test('unfinished account cannot navigate into application sections', () => {
    for (const path of ['home', 'friends', 'chat', 'settings', 'auth']) {
        assert.equal(recoveryRouteRedirect({ pending: true, signedIn: true, path }), 'recovery');
    }
    assert.equal(recoveryRouteRedirect({
        pending: true, signedIn: true, path: 'recovery'
    }), null);
});

test('complete account cannot enter recovery route', () => {
    assert.equal(recoveryRouteRedirect({
        pending: false, signedIn: true, path: 'recovery'
    }), 'home');
    assert.equal(recoveryRouteRedirect({
        pending: false, signedIn: true, path: 'home'
    }), null);
});

test('signed-out user never receives a recovery-only redirect', () => {
    assert.equal(recoveryRouteRedirect({
        pending: true, signedIn: false, path: 'home'
    }), null);
});
