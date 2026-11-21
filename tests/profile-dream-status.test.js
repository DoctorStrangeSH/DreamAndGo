import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/profile/profile.js', import.meta.url), 'utf8');

test('profile dream status rendering only accepts own known status labels', () => {
    assert.ok(source.includes("Object.hasOwn(statusLabels, dream.status) ? statusLabels[dream.status] : statusLabels.dreaming"));
    assert.ok(!source.includes("statusLabels[dream.status] || statusLabels.dreaming"));
});
