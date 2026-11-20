import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('browser LevelService cannot mutate XP or increment counters', () => {
    const source = read('../js/services/level.service.js');
    assert.match(source, /async addXP\(\)\s*\{\s*return null;/);
    assert.doesNotMatch(source, /updateDoc\(|increment\(/);
});

test('application action flow no longer submits client-selected XP actions', () => {
    const source = read('../js/app.js');
    const start = source.indexOf('    async onUserAction(action) {');
    const end = source.indexOf('\n    updateHomeStats()', start);
    const method = source.slice(start, end);
    assert.doesNotMatch(method, /awardXP\(|addXP\(/);
});

test('daily tasks use authenticated server callables and never submit client progress', () => {
    const service = read('../js/services/daily-tasks.service.js');
    const widget = read('../js/modules/daily-tasks/daily-tasks.js');
    assert.doesNotMatch(service, /levelService\.addXP\(|return 150;/);
    assert.match(service, /httpsCallable\(functions, 'getDailyTasksV2'\)/);
    assert.match(service, /claimDailyTaskRewardV2/);
    assert.match(service, /claimDailyTaskBonusV2/);
    assert.doesNotMatch(service, /setDoc\(|updateDoc\(|addDoc\(/);
    assert.match(widget, /claim-task-btn/);
    assert.match(widget, /claim-bonus-btn/);
    assert.match(widget, /Награда получена/);
});
