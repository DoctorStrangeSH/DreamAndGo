import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseSignupV2, signupV2Status } from '../js/core/signup-v2-policy.js';

test('signup v2 remains disabled unless every server readiness signal is true', () => {
    assert.equal(canUseSignupV2(undefined), false);
    assert.equal(canUseSignupV2({ enabled: true }), false);
    assert.equal(canUseSignupV2({ enabled: true, backendReady: true }), false);
    assert.equal(canUseSignupV2({
        enabled: true,
        backendReady: true,
        legacyMigrationVerified: false
    }), false);
    assert.equal(canUseSignupV2({
        enabled: true,
        backendReady: true,
        legacyMigrationVerified: true
    }), true);
});

test('signup status explains the closed gate without exposing implementation details', () => {
    assert.deepEqual(signupV2Status({ enabled: false }), {
        available: false,
        message: 'Новая регистрация пока проходит проверку. Попробуйте позже.'
    });
    assert.deepEqual(signupV2Status({
        enabled: true,
        backendReady: true,
        legacyMigrationVerified: true
    }), { available: true, message: '' });
});
