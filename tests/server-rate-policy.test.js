import test from 'node:test';
import assert from 'node:assert/strict';
import { canSendChatMessage, CHAT_SEND_COOLDOWN_MS } from '../server/rate-policy.js';

const at = millis => ({ toMillis: () => millis });

test('first message is allowed and the next send obeys global cooldown', () => {
    const now = 5_000;
    assert.equal(canSendChatMessage(null, now), true);
    assert.equal(canSendChatMessage(at(now), now), false);
    assert.equal(canSendChatMessage(at(now), now + CHAT_SEND_COOLDOWN_MS - 1), false);
    assert.equal(canSendChatMessage(at(now), now + CHAT_SEND_COOLDOWN_MS), true);
});

test('future timestamps, malformed records and clocks fail closed', () => {
    assert.equal(canSendChatMessage(at(5_001), 5_000), false);
    assert.equal(canSendChatMessage(undefined, 5_000), false);
    assert.equal(canSendChatMessage({}, 5_000), false);
    assert.equal(canSendChatMessage(at(Number.NaN), 5_000), false);
    assert.equal(canSendChatMessage(at(-1), 5_000), false);
    assert.equal(canSendChatMessage({ toMillis: () => { throw new Error('bad'); } }, 5_000), false);
    assert.equal(canSendChatMessage(null, -1), false);
    assert.equal(canSendChatMessage(null, Infinity), false);
    assert.equal(canSendChatMessage(null, 5_000, 0), false);
});

test('custom cooldown is strict at the boundary', () => {
    assert.equal(canSendChatMessage(at(1_000), 1_499, 500), false);
    assert.equal(canSendChatMessage(at(1_000), 1_500, 500), true);
});
