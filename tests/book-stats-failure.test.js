import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/services/book.service.js', import.meta.url), 'utf8');
const start = source.indexOf('    async updateUserStats(userId) {');
const end = source.indexOf('\n    }', start);
const method = source.slice(start, end + 6);
assert.ok(start >= 0 && method.includes('async updateUserStats'));

function harness(activeUid = 'alice') {
    const refreshCalls = [];
    const Book = new Function('console', 'isAuthenticatedOwner', 'auth', 'refreshUserStats',
        'return class Book {' + method + '};')(
        { error() {} },
        (requestedUid, authenticatedUid) => requestedUid === authenticatedUid,
        { currentUser: { uid: activeUid } },
        async uid => { refreshCalls.push(uid); return true; }
    );
    return { book: new Book(), refreshCalls };
}

test('book stats refresh delegates to the trusted server callable', async () => {
    const { book, refreshCalls } = harness();
    await book.updateUserStats('alice');
    assert.deepEqual(refreshCalls, ['alice']);
});

test('book stats refresh refuses a different active account', async () => {
    const { book, refreshCalls } = harness();
    await book.updateUserStats('bob');
    assert.deepEqual(refreshCalls, []);
});
