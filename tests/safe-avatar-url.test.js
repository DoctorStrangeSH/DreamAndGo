import test from 'node:test';
import assert from 'node:assert/strict';
import { safeAvatarURL } from '../js/core/safe-avatar-url.js';

test('accepts secure image URLs only', () => {
    assert.equal(safeAvatarURL('https://example.com/avatar.png'), 'https://example.com/avatar.png');
    assert.equal(safeAvatarURL('http://example.com/avatar.png'), '');
    assert.equal(safeAvatarURL('javascript:alert(1)'), '');
    assert.equal(safeAvatarURL('data:image/svg+xml,<svg onload=alert(1)>'), '');
    assert.equal(safeAvatarURL('//example.com/avatar.png'), '');
});

test('rejects credentials, malformed and absent URLs', () => {
    assert.equal(safeAvatarURL('https://user:password@example.com/a.png'), '');
    assert.equal(safeAvatarURL('not a url'), '');
    assert.equal(safeAvatarURL(null), '');
});
