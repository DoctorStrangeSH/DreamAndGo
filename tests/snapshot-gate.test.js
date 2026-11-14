import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotGate } from '../js/core/snapshot-gate.js';

test('only newest async snapshot may be delivered', () => {
    const gate = new SnapshotGate();
    const slow = gate.begin();
    const fast = gate.begin();
    assert.equal(gate.isLatest(slow), false);
    assert.equal(gate.isLatest(fast), true);
});

test('separate subscriptions have separate snapshot clocks', () => {
    const friends = new SnapshotGate();
    const chats = new SnapshotGate();
    const friendsFirst = friends.begin();
    const chatsFirst = chats.begin();
    friends.begin();
    assert.equal(friends.isLatest(friendsFirst), false);
    assert.equal(chats.isLatest(chatsFirst), true);
});
