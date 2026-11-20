import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAchievementAwards } from '../js/core/achievement-award-policy.js';

const catalog = {
    reader: {
        title: 'Читатель',
        icon: 'book',
        category: 'books',
        condition: stats => stats.books >= 1,
        levels: [
            { level: 1, title: 'Начинающий', description: 'Одна книга', condition: stats => stats.books >= 1 },
            { level: 2, title: 'Знаток', description: 'Пять книг', condition: stats => stats.books >= 5 }
        ]
    },
    collector: {
        title: 'Коллекционер',
        category: 'special',
        condition: stats => stats.books >= 1 && stats.travels >= 1
    }
};

test('awards only newly qualified levels without mutating stored state', () => {
    const stored = [];
    const result = calculateAchievementAwards({ books: 5, travels: 1 }, stored, catalog, '2026-11-20T10:00:00.000Z');
    assert.equal(result.newAchievements.length, 2);
    assert.deepEqual(result.newAchievements.map(item => [item.id, item.level]), [['reader', 1], ['collector', 1]]);
    assert.equal(stored.length, 0);
    assert.equal(result.updatedAchievements.length, 2);
});

test('advances one level at a time and never duplicates already awarded levels', () => {
    const stored = [{ id: 'reader', level: 1, title: 'Начинающий' }];
    const result = calculateAchievementAwards({ books: 10 }, stored, catalog, '2026-11-20T10:00:00.000Z');
    assert.deepEqual(result.newAchievements.map(item => [item.id, item.level]), [['reader', 2]]);
    assert.equal(result.updatedAchievements.filter(item => item.id === 'reader').length, 1);
    const repeated = calculateAchievementAwards({ books: 10 }, result.updatedAchievements, catalog);
    assert.equal(repeated.newAchievements.length, 0);
});

test('ignores malformed counters and safely normalizes legacy stored achievements', () => {
    const result = calculateAchievementAwards({ books: 'not-a-number', travels: -1 }, [null, {}, { id: 'reader', level: 0 }], catalog);
    assert.deepEqual(result.newAchievements, []);
    assert.deepEqual(result.updatedAchievements, [{ id: 'reader', level: 1 }]);
});

test('deduplicates legacy achievement entries and preserves the highest attained level', () => {
    const stored = [
        { id: 'reader', title: 'Старый уровень' },
        { id: 'reader', level: 2, title: 'Знаток' },
        { id: 'reader', level: 1, title: 'Начинающий' }
    ];
    const result = calculateAchievementAwards({ books: 10 }, stored, catalog);
    assert.equal(result.updatedAchievements.filter(item => item.id === 'reader').length, 1);
    assert.equal(result.updatedAchievements.find(item => item.id === 'reader').level, 2);
    assert.equal(result.newAchievements.length, 0);
});
