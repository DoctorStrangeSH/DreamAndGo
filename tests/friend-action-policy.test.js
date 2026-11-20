import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidFriendPair, isCurrentFriendActor } from '../js/core/friend-action-policy.js';

test('friend actions require two distinct valid Firestore UID path segments', () => {
    for (const [userId, friendId] of [['alice', 'bob'], ['a'.repeat(128), 'b'.repeat(128)]]) {
        assert.equal(isValidFriendPair(userId, friendId), true);
    }
    for (const pair of [
        ['', 'bob'], ['alice', ''], ['alice', 'alice'],
        ['alice/', 'bob'], ['alice', 'b/ob'],
        [' alice', 'bob'], ['alice ', 'bob'],
        ['a'.repeat(129), 'bob'], [null, 'bob'], ['alice', 42]
    ]) {
        assert.equal(isValidFriendPair(...pair), false);
    }
});

test('friend actions are restricted to the authenticated actor', () => {
    assert.equal(isCurrentFriendActor('alice', 'alice'), true);
    assert.equal(isCurrentFriendActor('alice', 'bob'), false);
    assert.equal(isCurrentFriendActor('alice', null), false);
    assert.equal(isCurrentFriendActor(null, 'alice'), false);
    assert.equal(isCurrentFriendActor('', ''), false);
});
