import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/services/chat.service.js', import.meta.url), 'utf8');

test('chat deletion imports the Firestore query limiter it uses', () => {
    assert.match(source, /query\(messagesRef,\s*limit\(499\)\)/);
    const imports = source.match(/import\s*\{([^}]+)\}\s*from\s*['"]https:\/\/www\.gstatic\.com\/firebasejs\/[^'"]+firebase-firestore\.js['"]/s);
    assert.ok(imports, 'Firestore named import must be present');
    const namedImports = imports[1].split(',').map(name => name.trim());
    assert.ok(namedImports.includes('limit'), 'Firestore limit must be imported');
});
