import test from 'node:test';
import assert from 'node:assert/strict';
import { safeCount, getHomeSnapshot, getNextHomeAchievement } from '../js/core/home-snapshot.js';

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

test('home dashboard selects a nearly completed milestone from existing stats', () => {
    const next = getNextHomeAchievement({ stats: { dreams: 1, travels: 4, books: 0 }, achievements: [
        { id: 'first_dream', level: 1 }, { id: 'first_travel', level: 1 }
    ] });
    assert.equal(next.id, 'first_travel');
    assert.equal(next.href, '#travels');
    assert.deepEqual([next.current, next.target, next.percentage], [4, 5, 80]);
});

test('home dashboard never trusts achievement levels or malformed counts', () => {
    const next = getNextHomeAchievement({ stats: { travels: Infinity, dreams: -99 }, achievements: [
        { id: 'first_travel', level: 99999 }, { id: 'first_dream', level: -2 }
    ] });
    assert.equal(next.id, 'first_dream');
    assert.equal(next.current, 0);
    assert.equal(next.target, 1);
    assert.equal(next.percentage, 0);
    assert.equal(getNextHomeAchievement({ achievements: NEXT_ALL_COMPLETE() }), null);
});

function NEXT_ALL_COMPLETE() {
    return [
        ['first_dream', 2], ['first_travel', 4], ['first_book', 4],
        ['first_movie', 4], ['first_restaurant', 3], ['first_friend', 3]
    ].map(([id, level]) => ({ id, level }));
}
