import test from 'node:test';
import assert from 'node:assert/strict';
import { getProfileCollection } from '../js/core/profile-access.js';

test('owner profile resolves to private users collection', () => {
    assert.equal(getProfileCollection('user-1', 'user-1'), 'users');
});

test('another account resolves only to public profile projection', () => {
    assert.equal(getProfileCollection('user-2', 'user-1'), 'publicProfiles');
});

test('unauthenticated visitor can only resolve public profile projection', () => {
    assert.equal(getProfileCollection('user-2', null), 'publicProfiles');
});

test('invalid profile identifiers never produce a Firestore collection path', () => {
    for (const id of [null, '', '../other', 'a'.repeat(129)]) {
        assert.equal(getProfileCollection(id, 'user-1'), null);
    }
});
