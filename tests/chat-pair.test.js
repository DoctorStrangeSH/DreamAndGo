import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationPairKey } from '../server/chat-pair.js';

test('pair index is symmetric and stable', () => {
    assert.equal(conversationPairKey('alice', 'bob'), conversationPairKey('bob', 'alice'));
    assert.match(conversationPairKey('alice', 'bob'), /^v2_[a-f0-9]{64}$/);
});

test('length-prefix encoding avoids collisions in the legacy underscore format', () => {
    assert.notEqual(conversationPairKey('a_b', 'c'), conversationPairKey('a', 'b_c'));
    assert.notEqual(conversationPairKey('é', 'x'), conversationPairKey('e', 'x'));
});

test('pair keys reject invalid and self-conversations', () => {
    for (const [a, b] of [
        ['alice', 'alice'], ['', 'bob'], [null, 'bob'], ['alice', undefined],
        [' alice', 'bob'], ['alice ', 'bob'], ['a/b', 'bob'], ['u'.repeat(129), 'bob']
    ]) {
        assert.throws(() => conversationPairKey(a, b), TypeError);
    }
});
