import test from 'node:test';
import assert from 'node:assert/strict';
import { XP_REWARDS, XP_DAILY_LIMIT, XP_DAILY_ACTION_LIMIT, isDreamCompletionTransition } from '../server/xp-rewards.js';

test('server XP rewards are explicit and do not grant unknown default rewards', () => {
    assert.deepEqual(XP_REWARDS, {
        travels: 50, restaurants: 30, movies: 20, books: 25,
        dreams: 15, friends: 40, complete_dream: 100
    });
    assert.equal(XP_DAILY_LIMIT, 300);
    assert.equal(XP_DAILY_ACTION_LIMIT, 5);
    assert.equal(Object.hasOwn(XP_REWARDS, 'daily_login'), false);
    assert.equal(Object.hasOwn(XP_REWARDS, 'send_message'), false);
});

test('dream completion policy requires a real state transition', () => {
    assert.equal(isDreamCompletionTransition({ status: 'in_progress' }, { status: 'completed' }), true);
    assert.equal(isDreamCompletionTransition({ status: 'completed' }, { status: 'completed' }), false);
});
