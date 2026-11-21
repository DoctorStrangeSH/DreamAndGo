import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const searchSource = readFileSync(new URL('../js/services/search.service.js', import.meta.url), 'utf8');
const levelSource = readFileSync(new URL('../js/services/level.service.js', import.meta.url), 'utf8');

test('personal search rejects non-owner requests and rechecks ownership after every async read', () => {
    assert.match(searchSource, /isAuthenticatedOwner\(userId, auth\?\.currentUser\?\.uid\)/);
    assert.match(searchSource, /if \(!this\.isCurrentOwner\(userId\)\) return \[\];/);
    for (const collection of ['travels', 'restaurants', 'movies', 'books', 'dreams']) {
        const queryLine = new RegExp('getDocs\\(collection\\(this\\.db, [\\'"]users[\\'"], userId, [\\'"]' + collection + '[\\'"]\\)\\)');
        assert.match(searchSource, queryLine, collection + ' must remain owner-scoped');
    }
    assert.ok((searchSource.match(/if \(!this\.isCurrentOwner\(userId\)\) return \[\];/g) || []).length >= 11,
        'search must check ownership before and after each of five async reads and before caching');
    assert.match(searchSource, /return this\.isCurrentOwner\(userId\) \? this\.filterCache\(searchTerm\) : \[\];/);
});

test('level lookup rejects non-owner requests and discards results after an account switch', () => {
    assert.match(levelSource, /if \(!isAuthenticatedOwner\(userId, auth\?\.currentUser\?\.uid\)\)/);
    assert.match(levelSource, /const userDoc = await getDoc\(doc\(this\.db, [\\'"]users[\\'"], userId\)\);[\\s\\S]*?if \(!isAuthenticatedOwner\(userId, auth\?\.currentUser\?\.uid\)\)/);
});
