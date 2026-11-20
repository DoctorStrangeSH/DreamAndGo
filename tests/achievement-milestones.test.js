import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/achievements/achievements.js', import.meta.url), 'utf8');
const from = source.indexOf('const MILESTONES =');
const to = source.indexOf('export class AchievementsModule', from);
assert.ok(from >= 0 && to > from);
const getProgress = new Function(`${source.slice(from, to).replaceAll('export function ', 'function ')} return getAchievementMilestone;`)();
const getTier = new Function(`${source.slice(from, to).replaceAll('export function ', 'function ')} return getAchievementTier;`)();
const css = readFileSync(new URL('../css/atlas-pages.css', import.meta.url), 'utf8');

test('achievement progress follows the next level and clamps malformed stats', () => {
    assert.deepEqual(getProgress({ id: 'first_travel' }, 1, { travels: 3 }), { current: 3, target: 5, percentage: 60 });
    assert.deepEqual(getProgress({ id: 'first_travel' }, 1, { travels: 100 }), { current: 5, target: 5, percentage: 100 });
    assert.deepEqual(getProgress({ id: 'first_travel' }, 1, { travels: -99 }), { current: 0, target: 5, percentage: 0 });
    assert.equal(getProgress({ id: 'first_travel' }, 4, { travels: 100 }), null);
});

test('completed dreams and all collection categories use their actual milestones', () => {
    assert.deepEqual(getProgress({ id: 'first_dream' }, 2, { dreams: 99, dreamsCompleted: 2 }), { current: 2, target: 3, percentage: 67 });
    assert.deepEqual(getProgress({ id: 'collector' }, 0, { travels: 2, restaurants: 1, movies: 3, books: 0, dreams: 1 }), { current: 4, target: 5, percentage: 80 });
    assert.deepEqual(getProgress({ id: 'perfect_week' }, 0, { travels: 99, movies: 40, books: 12, weeklyActivityCount: 7 }), { current: 7, target: 7, percentage: 100 });
    assert.deepEqual(getProgress({ id: 'perfect_week' }, 0, { travels: 99, movies: 40, books: 12, weeklyActivityCount: 2 }), { current: 2, target: 7, percentage: 29 });
});

test('achievement overview counts earned levels, not only achievement records', () => {
    assert.match(source, /totalEarned = all\.reduce/);
    assert.match(source, /Math\.min\(achievement\.levels\.length, Math\.max\(0, level\)\)/);
    assert.match(source, /role="progressbar" aria-label="Прогресс достижения/);
    assert.match(source, /escapeHTML\(e\?\.title \|\| a\.title\)/);
});

test('achievement tiers have distinct states and reduced-motion styling', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 99, -2, NaN].map(level => getTier(level).id),
        ['locked', 'bronze', 'silver', 'gold', 'legendary', 'legendary', 'locked', 'locked']);
    assert.match(source, /achievement-tier--\$\{tier\.id\}/);
    assert.match(source, /achievement-tier-badge--\$\{tier\.id\}/);
    for (const tier of ['bronze', 'silver', 'gold', 'legendary']) {
        assert.ok(css.includes('.achievement-tier--' + tier));
        assert.ok(css.includes('.achievement-tier-badge--' + tier));
    }
    assert.match(css, /prefers-reduced-motion:reduce\)\s*\{\.achievement-item/);
});
