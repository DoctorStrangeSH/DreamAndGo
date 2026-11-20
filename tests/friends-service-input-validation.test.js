import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isValidFriendPair } from '../js/core/friend-action-policy.js';

const source = readFileSync(new URL('../js/services/friends.service.js', import.meta.url), 'utf8');
const uiSource = readFileSync(new URL('../js/modules/friends/friends.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
const callableSource = readFileSync(new URL('../js/services/friendship-callable.service.js', import.meta.url), 'utf8');

test('all friendship mutations are delegated to one authenticated callable boundary', () => {
    assert.match(source, /import \{ mutateFriendship \} from '\.\/friendship-callable\.service\.js'/);
    assert.match(source, /async runFriendshipMutation\(userId, friendId, action/);
    assert.match(source, /!isCurrentUser\(userId\) \|\| !isValidFriendPair\(userId, friendId\)/);
    for (const [method, action] of [
        ['sendFriendRequest', 'send'],
        ['acceptFriendRequest', 'accept'],
        ['rejectFriendRequest', 'reject'],
        ['cancelFriendRequest', 'cancel'],
        ['removeFriend', 'remove']
    ]) {
        const start = source.indexOf('    async ' + method + '(');
        const next = source.indexOf('\n    async ', start + 1);
        const body = source.slice(start, next < 0 ? source.length : next);
        assert.ok(body.includes('runFriendshipMutation('), method + ' delegates through the shared callable guard');
        assert.ok(body.includes(`'${action}'`), method + ' selects the correct server action');
    }
    assert.doesNotMatch(source, /runTransaction|transaction\.(?:set|create|delete)|serverTimestamp/);
});

test('cancel action uses the current account as sender, not the recipient', () => {
    assert.match(uiSource, /cancelFriendRequest\(uid, btn\.dataset\.uid\)/);
    assert.doesNotMatch(uiSource, /rejectFriendRequest\(btn\.dataset\.uid, uid\)/);
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
