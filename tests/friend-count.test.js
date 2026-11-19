import test from 'node:test';
import assert from 'node:assert/strict';
import { countFriendRecords } from '../js/core/friend-count.js';

test('counts relationship documents without needing profile data', () => {
    assert.equal(countFriendRecords([{ id: '_init' }, { id: 'friend-a' }, { id: 'friend-b' }]), 2);
});

test('handles missing and malformed relationship lists', () => {
    assert.equal(countFriendRecords(null), 0);
    assert.equal(countFriendRecords([null, {}, { id: '_init' }, { id: 'friend-c' }]), 1);
});
