import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/services/book.service.js', import.meta.url), 'utf8');

test('BookService imports both create and partial-update validators it calls', () => {
    assert.match(
        source,
        /import\s*\{[^}]*\bvalidateBookInput\b[^}]*\bvalidateBookUpdateInput\b[^}]*\}\s*from\s*['"]\.\.\/core\/collection-input-policy\.js['"]/
    );
    assert.match(source, /safeData\s*=\s*validateBookInput\(data\)/);
    assert.match(source, /runTransaction\(this\.db,\s*async transaction/);
    assert.match(source, /transaction\.get\(bookRef\)/);
    assert.match(source, /safeUpdates\s*=\s*validateBookUpdateInput\(existingSnapshot\.data\(\),\s*updates\)/);
    assert.match(source, /transaction\.update\(bookRef/);
});
