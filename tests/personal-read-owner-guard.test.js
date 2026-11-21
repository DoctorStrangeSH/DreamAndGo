import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const searchSource = readFileSync(new URL('../js/services/search.service.js', import.meta.url), 'utf8');
const levelSource = readFileSync(new URL('../js/services/level.service.js', import.meta.url), 'utf8');

test('personal search rejects non-owner requests and rechecks ownership after every async read', () => {
    assert.ok(searchSource.includes('isAuthenticatedOwner(userId, auth?.currentUser?.uid)'));
    assert.ok(searchSource.includes('if (!this.isCurrentOwner(userId)) return [];'));
    for (const collection of ['travels', 'restaurants', 'movies', 'books', 'dreams']) {
        assert.ok(searchSource.includes("getDocs(collection(this.db, 'users', userId, '" + collection + "'))"),
            collection + ' must remain owner-scoped');
    }
    assert.ok((searchSource.match(/if \(!this\.isCurrentOwner\(userId\)\) return \[\];/g) || []).length >= 11,
        'search must check ownership before and after each of five async reads and before caching');
    assert.ok(searchSource.includes('return this.isCurrentOwner(userId) ? this.filterCache(searchTerm) : [];'));
});

test('level lookup rejects non-owner requests and discards results after an account switch', () => {
    assert.ok(levelSource.includes('if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid))'));
    const readAt = levelSource.indexOf("const userDoc = await getDoc(doc(this.db, 'users', userId));");
    const secondGuardAt = levelSource.indexOf('if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid))', readAt + 1);
    assert.ok(readAt >= 0 && secondGuardAt > readAt, 'level lookup must recheck the owner after the async document read');
});
