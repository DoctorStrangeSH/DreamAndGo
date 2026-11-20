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

test('daily tasks cannot grant XP while their progress is client-maintained', () => {
    const service = read('../js/services/daily-tasks.service.js');
    const widget = read('../js/modules/daily-tasks/daily-tasks.js');
    assert.doesNotMatch(service, /levelService\.addXP\(|return 150;/);
    assert.match(widget, /Награда скоро/);
    assert.match(widget, /Бонус станет доступен после серверной проверки/);
    assert.doesNotMatch(widget, /claim-task-btn|claim-bonus-btn/);
});
