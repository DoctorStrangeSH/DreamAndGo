import test from 'node:test';
import assert from 'node:assert/strict';
import { safeCount, getHomeSnapshot } from '../js/core/home-snapshot.js';

test('normalizes profile counters before interpolating into HTML', () => {
    assert.equal(safeCount('<img src=x onerror=alert(1)>'), 0);
    assert.equal(safeCount(-2), 0);
    assert.equal(safeCount(Infinity), 0);
    assert.equal(safeCount(5.9), 5);
    assert.equal(safeCount(2000000), 999999);
});

test('onboarding starts empty with a clear first action', () => {
    const snapshot = getHomeSnapshot();
    assert.equal(snapshot.onboardingPercent, 0);
    assert.equal(snapshot.startedTasks, 0);
    assert.equal(snapshot.nextAction.href, '#dreams');
});

test('completed onboarding and dream progress use existing Firestore stats', () => {
    const snapshot = getHomeSnapshot({ stats: {
        dreams: 3, dreamsCompleted: 1, dreamsInProgress: 2,
        travels: 2, movies: 1, books: 1, friends: 1
    } });
    assert.equal(snapshot.onboardingPercent, 100);
    assert.equal(snapshot.dreamsCompleted, 1);
    assert.equal(snapshot.dreamsInProgress, 2);
    assert.equal(snapshot.nextAction.href, '#dreams');
});

test('invalid dream subcounts never exceed total dreams', () => {
    const snapshot = getHomeSnapshot({ stats: {
        dreams: 2, dreamsCompleted: 100, dreamsInProgress: 100
    } });
    assert.equal(snapshot.dreamsCompleted, 2);
    assert.equal(snapshot.dreamsInProgress, 0);
});
