import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isValidFriendPair } from '../js/core/friend-action-policy.js';

const source = readFileSync(new URL('../js/services/friends.service.js', import.meta.url), 'utf8');

test('friend service delegates relationship ID validation to the shared policy', () => {
    assert.match(source, /import \{ isValidFriendPair, isCurrentFriendActor \} from '\.\.\/core\/friend-action-policy\.js'/);
    for (const method of ['sendFriendRequest', 'acceptFriendRequest', 'rejectFriendRequest', 'removeFriend']) {
        const start = source.indexOf('    async ' + method + '(');
        const next = source.indexOf('\n    async ', start + 1);
        const body = source.slice(start, next < 0 ? source.length : next);
        assert.match(body, /!isValidFriendPair\(/, method + ' validates pair before writes');
        assert.ok(body.indexOf('!isValidFriendPair(') < body.indexOf('try {'),
            method + ' rejects invalid IDs before Firestore operations');
    }
});

test('invalid friend identifiers cannot become Firestore path segments', () => {
    assert.equal(isValidFriendPair('alice', 'bob'), true);
    for (const [userId, friendId] of [
        ['alice', 'alice'], ['', 'bob'], ['alice', ''], ['a/b', 'bob'],
        ['alice', 'b/c'], [' alice', 'bob'], ['alice', ' bob'],
        ['a'.repeat(129), 'bob'], ['alice', 'b'.repeat(129)]
    ]) {
        assert.equal(isValidFriendPair(userId, friendId), false);
    }
});
