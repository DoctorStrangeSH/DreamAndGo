import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/services/book.service.js', import.meta.url), 'utf8');
const start = source.indexOf('    async getBooks(userId, filters = {}, { throwOnError = false } = {}) {');
const end = source.indexOf('    async addBook(', start);
assert.ok(start >= 0 && end > start, 'BookService.getBooks must exist');
const method = source.slice(start, end);

function bookService(rows, { fail = false } = {}) {
    const Book = new Function('collection', 'query', 'orderBy', 'where', 'getDocs', 'console',
        `return class Book {
            constructor() { this.db = {}; }
            ${method}
        }`
    )(
        (_db, ...path) => path.join('/'),
        (...args) => args,
        (...args) => args,
        (...args) => args,
        async () => {
            if (fail) throw new Error('offline');
            return {
                forEach(fn) {
                    rows.forEach((entry, i) => fn({
                        id: String(i + 1),
                        data: () => entry
                    }));
                }
            };
        },
        { error() {} }
    );
    return new Book();
}

const books = [
    { title: 'Fantasy favorite', genres: ['fantasy'], userRating: 5 },
    { title: 'Fantasy low', genres: ['fantasy'], userRating: 2 },
    { title: 'Sci-fi favorite', genres: ['science-fiction'], userRating: 5 },
    { title: 'No genre', userRating: 5 }
];

test('books combine genre and minimum rating rather than returning early', async () => {
    const service = bookService(books);
    const result = await service.getBooks('alice', { genre: 'fantasy', rating: 4 });
    assert.deepEqual(result.map(book => book.title), ['Fantasy favorite']);
});

test('books keep individual filters and unfiltered results working', async () => {
    const service = bookService(books);
    assert.equal((await service.getBooks('alice', { genre: 'fantasy' })).length, 2);
    assert.equal((await service.getBooks('alice', { rating: 4 })).length, 3);
    assert.equal((await service.getBooks('alice', {})).length, 4);
});

test('book loading can expose a network failure rather than claim an empty library', async () => {
    const service = bookService([], { fail: true });
    assert.deepEqual(await service.getBooks('alice'), []);
    await assert.rejects(service.getBooks('alice', {}, { throwOnError: true }), /offline/);
});
