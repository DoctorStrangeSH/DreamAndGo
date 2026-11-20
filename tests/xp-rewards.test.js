import test from 'node:test';
import assert from 'node:assert/strict';
import { XP_REWARDS, XP_DAILY_LIMIT, XP_DAILY_ACTION_LIMIT, isDreamCompletionTransition } from '../js/core/xp-reward-policy.js';
import { isRewardableCollectionRecord } from '../server/xp-rewards.js';

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


test('XP triggers reject empty, malformed and unsupported collection records', () => {
    assert.equal(isRewardableCollectionRecord('travels', { title: '', type: 'city', status: 'planned' }, 'trip-1'), false);
    assert.equal(isRewardableCollectionRecord('travels', { title: 'Берлин', type: 'city', status: 'planned' }, 'trip-1'), true);
    assert.equal(isRewardableCollectionRecord('restaurants', { name: 'Cafe', cuisine: 'Unknown', status: 'visited' }, 'rest-1'), false);
    assert.equal(isRewardableCollectionRecord('movies', { title: 'Film', movieId: 42, status: 'watched' }, 'movie-1'), true);
    assert.equal(isRewardableCollectionRecord('books', { title: 'Book', author: 'Writer', status: 'read' }, 'book-1'), true);
    assert.equal(isRewardableCollectionRecord('dreams', { title: 'Мечта', status: 'completed' }, 'dream-1'), true);
    assert.equal(isRewardableCollectionRecord('friends', { friendId: 'bob' }, 'alice'), false);
    assert.equal(isRewardableCollectionRecord('friends', { friendId: 'bob' }, 'bob'), true);
    assert.equal(isRewardableCollectionRecord('unknown', { title: 'anything' }, 'x'), false);
    assert.equal(isRewardableCollectionRecord('travels', { title: 'Trip', type: 'city', status: 'planned' }, '_init'), false);
});
