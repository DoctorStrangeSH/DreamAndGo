import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/services/travel.service.js', import.meta.url), 'utf8');

function methodBetween(start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    assert.notEqual(from, -1, 'method start must exist');
    assert.notEqual(to, -1, 'method end must exist');
    return source.slice(from, to);
}

test('confirmed travel creates stay successful when derived stats refresh fails', () => {
    const method = methodBetween('async addTravel(', 'async updateTravel(');
    assert.ok(method.indexOf('await addDoc(travelsRef, newTravel)') < method.indexOf('await this.updateUserStatsBestEffort(userId)'));
    assert.match(method, /await this\.updateUserStatsBestEffort\(userId\)/);
    const helper = methodBetween('async updateUserStatsBestEffort(', 'async updateUserStats(');
    assert.match(helper, /try\s*\{\s*await this\.updateUserStats\(userId\);\s*\}\s*catch\s*\(statsError\)/);
    assert.match(method, /return\s*\{\s*success:\s*true,\s*id:/);
});

test('confirmed travel updates stay successful when derived stats refresh fails', () => {
    const method = methodBetween('async updateTravel(', 'async deleteTravel(');
    assert.ok(method.indexOf('await updateDoc(travelRef') < method.indexOf('await this.updateUserStatsBestEffort(userId)'));
    assert.match(method, /await this\.updateUserStatsBestEffort\(userId\)/);
    const helper = methodBetween('async updateUserStatsBestEffort(', 'async updateUserStats(');
    assert.match(helper, /try\s*\{\s*await this\.updateUserStats\(userId\);\s*\}\s*catch\s*\(statsError\)/);
    assert.match(method, /return\s*\{\s*success:\s*true\s*\}/);
});
