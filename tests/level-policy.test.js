import test from 'node:test';
import assert from 'node:assert/strict';
import { getLevelFromXP, normalizeXP } from '../js/core/level-policy.js';

test('normalizes malformed, negative and oversized XP without unbounded work', () => {
    assert.equal(normalizeXP(Infinity), 0);
    assert.equal(normalizeXP(-10), 0);
    assert.equal(normalizeXP('not-a-number'), 0);
    assert.equal(normalizeXP('150'), 150);
    assert.equal(normalizeXP(Number.MAX_VALUE), Number.MAX_SAFE_INTEGER);
});

test('calculates level boundaries and progress deterministically', () => {
    assert.deepEqual(getLevelFromXP(0), {
        level: 1, currentLevelXP: 150, totalXPForLevel: 0, progress: 0
    });
    assert.deepEqual(getLevelFromXP(149), {
        level: 1, currentLevelXP: 150, totalXPForLevel: 149, progress: 99
    });
    assert.deepEqual(getLevelFromXP(150), {
        level: 2, currentLevelXP: 250, totalXPForLevel: 0, progress: 0
    });
    assert.deepEqual(getLevelFromXP(400), {
        level: 3, currentLevelXP: 350, totalXPForLevel: 0, progress: 0
    });
});

test('corrupt XP never produces invalid progress or a non-finite level', () => {
    for (const value of [Infinity, -Infinity, NaN, -1, 'Infinity', 'bad', Number.MAX_VALUE]) {
        const result = getLevelFromXP(value);
        assert.ok(Number.isSafeInteger(result.level));
        assert.ok(result.level >= 1);
        assert.ok(Number.isFinite(result.progress));
        assert.ok(result.progress >= 0 && result.progress <= 100);
    }
});
