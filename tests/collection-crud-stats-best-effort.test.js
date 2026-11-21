import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const services = [
    ['dreams.service.js', 'Dream', 'addDream', 'updateDream', 'deleteDream'],
    ['travel.service.js', 'Travel', 'addTravel', 'updateTravel', 'deleteTravel'],
    ['book.service.js', 'Book', 'addBook', 'updateBook', 'deleteBook'],
    ['movie.service.js', 'Movie', 'addMovie', 'updateMovie', 'deleteMovie'],
    ['restaurant.service.js', 'Restaurant', 'addRestaurant', 'updateRestaurant', 'deleteRestaurant']
];

function extractMethod(source, name) {
    const start = source.indexOf(`async ${name}(`);
    assert.notEqual(start, -1, `${name} must exist`);
    const end = source.indexOf('\n    async ', start + 1);
    return source.slice(start, end === -1 ? source.length : end);
}

for (const [file, label, create, update, remove] of services) {
    test(`${label} CRUD treats statistics refresh as best effort`, () => {
        const source = readFileSync(new URL(`../js/services/${file}`, import.meta.url), 'utf8');
        for (const methodName of [create, update, remove]) {
            const method = extractMethod(source, methodName);
            assert.match(method, /await this\.updateUserStatsBestEffort\(userId\)/, `${methodName} must not turn a committed write into a false failure`);
            assert.doesNotMatch(method, /await this\.updateUserStats\(userId\);/);
        }
        assert.match(source, /async updateUserStatsBestEffort\(userId\)/);
        assert.match(source, /await this\.updateUserStats\(userId\)/);
    });
}
