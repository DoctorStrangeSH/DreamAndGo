import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/services/friends.service.js', import.meta.url), 'utf8');

test('friend relationship writes validate both UIDs before creating Firestore paths', () => {
    assert.match(source, /function isValidFriendPair\(userId, friendId\)/);
    assert.match(source, /typeof value === 'string'/);
    assert.match(source, /value\.length <= 128/);
    assert.match(source, /value\.trim\(\) === value/);
    assert.match(source, /!value\.includes\('\/'\)/);
    assert.match(source, /userId !== friendId/);

    for (const method of ['sendFriendRequest', 'acceptFriendRequest', 'rejectFriendRequest', 'removeFriend']) {
        const start = source.indexOf('    async ' + method + '(');
        const next = source.indexOf('\n    async ', start + 1);
        const body = source.slice(start, next < 0 ? source.length : next);
        assert.match(body, /if \(!isValidFriendPair\(/, method + ' validates pair before writes');
        assert.ok(body.indexOf('if (!isValidFriendPair(') < body.indexOf('try {'),
            method + ' rejects invalid IDs before Firestore operations');
    }
});

test('invalid friend identifiers cannot become Firestore path segments', () => {
    const helperStart = source.indexOf('function isValidFriendPair(');
    const helperEnd = source.indexOf('\n}', helperStart) + 2;
    const helper = source.slice(helperStart, helperEnd);
    assert.ok(helperStart >= 0 && helperEnd > helperStart);
    assert.match(helper, /!value\.includes\('\/'\)/);
    assert.match(helper, /value\.length > 0/);
});
