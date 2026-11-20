import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/services/book.service.js', import.meta.url), 'utf8');
const start = source.indexOf('    async updateUserStats(userId) {');
const method = source.slice(start, source.lastIndexOf('\n}'));
assert.ok(start >= 0 && method.includes('async updateUserStats'));

function harness(getBooks) {
    const writes = [];
    const Book = new Function('doc', 'updateDoc', 'console', 'getBooks', 'isAuthenticatedOwner', 'auth', `
        return class Book {
            constructor() { this.db = {}; }
            getBooks(...args) { return getBooks(...args); }
            ${method}
        };
    `)(
        (_db, ...parts) => parts.join('/'),
        async (...args) => writes.push(args),
        { error() {} },
        getBooks,
        (requestedUid, activeUid) => requestedUid === activeUid,
        { currentUser: { uid: 'alice' } }
    );
    return { book: new Book(), writes };
}

test('failed book fetch does not erase previously stored stats', async () => {
    const { book, writes } = harness(async (_uid, _filters, options) => {
        assert.equal(options.throwOnError, true);
        throw new Error('offline');
    });
    await book.updateUserStats('alice');
    assert.equal(writes.length, 0);
});

test('successful book fetch updates all counters', async () => {
    const { book, writes } = harness(async () => [
        { status: 'reading' }, { status: 'read' }, { status: 'want_to_read' }
    ]);
    await book.updateUserStats('alice');
    assert.deepEqual(writes, [['users/alice', {
        'stats.books': 3,
        'stats.booksRead': 1,
        'stats.booksReading': 1,
        'stats.booksWantToRead': 1
    }]]);
});
