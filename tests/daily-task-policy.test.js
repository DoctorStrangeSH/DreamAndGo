import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DAILY_TASK_CATALOG, DAILY_TASK_BONUS_XP, createDailyTaskSet, isValidDailyTaskId
} from '../js/core/daily-task-policy.js';

test('daily task assignment is deterministic for one user and UTC date', () => {
    const first = createDailyTaskSet('user-1', '2026-11-20');
    const second = createDailyTaskSet('user-1', '2026-11-20');
    assert.deepEqual(first, second);
    assert.equal(first.length, 3);
    assert.equal(new Set(first.map(task => task.id)).size, 3);
});

test('different users receive independently seeded assignments', () => {
    const first = createDailyTaskSet('user-1', '2026-11-20').map(task => task.id);
    const second = createDailyTaskSet('user-2', '2026-11-20').map(task => task.id);
    assert.notDeepEqual(first, second);
});

test('only six server-verifiable task types are in the release pool', () => {
    assert.deepEqual(DAILY_TASK_CATALOG.map(task => task.action), [
        'travels', 'restaurants', 'movies', 'books', 'dreams', 'friends'
    ]);
    assert.equal(DAILY_TASK_BONUS_XP, 100);
    assert.equal(isValidDailyTaskId('add_travel'), true);
    assert.equal(isValidDailyTaskId('send_5_messages'), false);
    assert.equal(isValidDailyTaskId('write_review'), false);
});

test('task assignment rejects malformed identity and date keys', () => {
    assert.throws(() => createDailyTaskSet('', '2026-11-20'), TypeError);
    assert.throws(() => createDailyTaskSet('user-1', 'today'), TypeError);
});
