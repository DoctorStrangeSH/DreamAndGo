import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modules = [
    { name: 'travel', path: '../js/modules/travels/travels.js', selector: "document.querySelectorAll('.delete-btn')" , service: 'travelService.deleteTravel' },
    { name: 'book', path: '../js/modules/books/books.js', selector: "document.querySelectorAll('.delete-btn')", service: 'bookService.deleteBook' },
    { name: 'restaurant', path: '../js/modules/restaurants/restaurants.js', selector: "document.querySelectorAll('.delete-btn')", service: 'restaurantService.deleteRestaurant' },
    { name: 'movie', path: '../js/modules/movies/movies.js', selector: "document.querySelectorAll('.delete-movie-btn')", service: 'movieService.deleteMovie' }
];

for (const item of modules) {
    const source = readFileSync(new URL(item.path, import.meta.url), 'utf8');
    const start = source.indexOf(item.selector);
    const end = source.indexOf('\n        });', start);
    const handler = source.slice(start, end > start ? end + 11 : source.length);

    test(item.name + ' deletion remains bound to the initiating account', () => {
        assert.ok(start >= 0, 'delete handler exists');
        assert.match(handler, /const userId = window\.app\.currentUser\?\.uid/);
        assert.match(handler, /if \(!userId \|\| btn\.disabled \|\| !confirm\(/);
        assert.ok(handler.includes('await this.' + item.service + '(userId,'), 'delete uses captured UID');
        assert.match(handler, /if \(window\.app\.currentUser\?\.uid !== userId/);
        assert.match(handler, /if \(window\.app\.currentUser\?\.uid === userId\) window\.app\.refreshUserData\(\)/);
        assert.match(handler, /finally \{\s*btn\.disabled = false/);
    });
}
