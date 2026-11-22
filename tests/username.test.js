import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidUsername, normalizeUsername } from '../js/core/username.js';

test('normalizeUsername creates a trimmed lowercase lookup key', () => {
    assert.equal(normalizeUsername('  Dream_123  '), 'dream_123');
    assert.equal(normalizeUsername(null), '');
});

test('isValidUsername accepts only 3–20 Latin letters, digits and underscores', () => {
    for (const value of ['abc', 'Dream_123', 'a'.repeat(20), '123']) {
        assert.equal(isValidUsername(value), true, value);
    }

    for (const value of ['', 'ab', 'a'.repeat(21), 'two words', 'имя', 'a-b', 'a.b']) {
        assert.equal(isValidUsername(value), false, value);
    }
});

test('username validation is case-insensitive but callers can enforce canonical display input', () => {
    assert.equal(isValidUsername('Dreamer'), true);
    assert.equal(normalizeUsername('Dreamer'), 'dreamer');
    assert.notEqual(' Dreamer ', ' Dreamer '.trim());
});
