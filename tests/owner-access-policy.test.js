import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthenticatedOwner, isValidFirestoreDocumentId } from '../js/core/owner-access-policy.js';

test('private collection access requires exact authenticated UID match', () => {
    assert.equal(isAuthenticatedOwner('alice', 'alice'), true);
    assert.equal(isAuthenticatedOwner('alice', 'bob'), false);
    assert.equal(isAuthenticatedOwner('alice', null), false);
    assert.equal(isAuthenticatedOwner(null, 'alice'), false);
    assert.equal(isAuthenticatedOwner('', ''), false);
});

test('document IDs must be one non-empty Firestore path segment', () => {
    for (const id of ['abc', 'user_123', 'a'.repeat(1500)]) {
        assert.equal(isValidFirestoreDocumentId(id), true);
    }
    for (const id of ['', '.', '..', 'a/b', ' a', 'a ', 'a'.repeat(1501), null, 42]) {
        assert.equal(isValidFirestoreDocumentId(id), false);
    }
});
