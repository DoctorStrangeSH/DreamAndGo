import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const paths = [
    '../js/services/travel.service.js',
    '../js/services/book.service.js',
    '../js/services/movie.service.js',
    '../js/services/restaurant.service.js',
    '../js/services/dreams.service.js'
];

test('all personal collection services delegate stats writes to the trusted callable', () => {
    for (const path of paths) {
        const source = readFileSync(new URL(path, import.meta.url), 'utf8');
        const start = source.indexOf('    async updateUserStats(userId) {');
        assert.ok(start >= 0, path + ' exposes updateUserStats');
        const end = source.indexOf('\n    }', start + 5);
        const method = source.slice(start, end);
        assert.match(method, /await refreshUserStats\(userId\)/, path + ' calls trusted stats refresh');
        assert.doesNotMatch(method, /updateDoc\(/, path + ' does not write profile counters from browser');
    }
});

test('stats callable client sends no caller-selected UID or counter values', () => {
    const source = readFileSync(new URL('../js/services/profile-stats.service.js', import.meta.url), 'utf8');
    assert.match(source, /uid !== requestedUid/);
    assert.match(source, /httpsCallable\(functions, 'refreshUserStatsV2'\)/);
    assert.match(source, /await callable\(\{\}\)/);
    assert.doesNotMatch(source, /callable\(\{[^}]*uid/);
});
