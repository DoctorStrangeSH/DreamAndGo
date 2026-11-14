import test from 'node:test';
import assert from 'node:assert/strict';
import { isConversationBlocked } from '../server/block-policy.js';

test('either user blocking the other denies chat', () => {
    const absent = { exists: false };
    const present = { exists: true };
    assert.equal(isConversationBlocked(absent, absent), false);
    assert.equal(isConversationBlocked(present, absent), true);
    assert.equal(isConversationBlocked(absent, present), true);
    assert.equal(isConversationBlocked(present, present), true);
});

test('missing or malformed snapshots do not accidentally grant access', () => {
    const absent = { exists: false };
    assert.equal(isConversationBlocked(undefined, absent), true);
    assert.equal(isConversationBlocked(absent, null), true);
    assert.equal(isConversationBlocked({}, absent), true);
});
