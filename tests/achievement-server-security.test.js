import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('achievement service is read-only in the browser', () => {
    const source = read('../js/services/achievements.service.js');
    assert.doesNotMatch(source, /runTransaction\(|calculateAchievementAwards\(/);
    assert.match(source, /async checkAndAwardAchievements\(\)\s*\{\s*return \[\];/);
    assert.match(source, /getUserAchievements/);
});

test('application obtains newly awarded achievements only from the trusted stats callable', () => {
    const source = read('../js/app.js');
    assert.match(source, /refreshUserStats\(requestedUid\)/);
    assert.doesNotMatch(source, /achievementsService\.checkAndAwardAchievements/);
});

test('server stats transaction calculates and persists achievement awards atomically', () => {
    const source = read('../server/profile-stats.js');
    assert.match(source, /calculateAchievementAwards\(/);
    assert.match(source, /update\.achievements = achievementResult\.updatedAchievements/);
    assert.match(source, /newAchievements: achievementResult\.newAchievements/);
});
