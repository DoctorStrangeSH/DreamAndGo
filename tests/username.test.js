import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsername, isValidUsername } from '../js/core/username.js';

test('normalizes username case and whitespace', () => {
    assert.equal(normalizeUsername('  Sherlock_DS  '), 'sherlock_ds');
    assert.equal(normalizeUsername(null), '');
});

test('rejects invalid usernames', () => {
    assert.equal(isValidUsername('Sherlock_DS'), true);
    assert.equal(isValidUsername('a'), false);
    assert.equal(isValidUsername('a b c'), false);
    assert.equal(isValidUsername('имя'), false);
    assert.equal(isValidUsername('<script>'), false);
});
