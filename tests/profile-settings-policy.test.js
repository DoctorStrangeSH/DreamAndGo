import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfileSettings } from '../js/core/profile-settings-policy.js';

test('settings allow bounded self-owned display fields only', () => {
    assert.deepEqual(validateProfileSettings({
        username: 'sherlock', displayName: ' Шерлок ',
        bio: ' Обо мне ', location: ' Москва '
    }, 'sherlock'), {
        displayName: 'Шерлок', bio: 'Обо мне', location: 'Москва'
    });
});

test('settings cannot smuggle privileges, user rename or enormous fields', () => {
    const base = { username: 'sherlock', displayName: 'Шерлок', bio: '', location: '' };
    for (const input of [
        { ...base, username: 'admin' },
        { ...base, role: 'admin' },
        { ...base, stats: { level: 999 } },
        { ...base, displayName: '' },
        { ...base, displayName: 'x'.repeat(81) },
        { ...base, bio: 'x'.repeat(501) },
        { ...base, location: 'x'.repeat(121) },
        { ...base, bio: 42 }
    ]) {
        assert.throws(() => validateProfileSettings(input, 'sherlock'), TypeError);
    }
});
