import test from 'node:test';
import assert from 'node:assert/strict';
import { getProfileGradient } from '../js/core/profile-gradient.js';

test('profile cover is stable for the same account', () => {
    const first = getProfileGradient('user-123');
    assert.equal(getProfileGradient('user-123'), first);
    assert.match(first, /^linear-gradient\(/);
});

test('profile cover handles absent identifiers', () => {
    assert.equal(typeof getProfileGradient(null), 'string');
    assert.equal(typeof getProfileGradient(''), 'string');
});
