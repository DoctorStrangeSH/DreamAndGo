import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');

test('every exported V2 callable enforces Firebase App Check', () => {
    const declarations = [...source.matchAll(
        /export const (\w+) = onCall\(\{([\s\S]*?)\},\s*async request =>/g
    )];

    assert.ok(declarations.length > 0, 'Expected exported callable declarations in server/index.js');

    const missing = declarations
        .filter(([, , options]) => !/\benforceAppCheck\s*:\s*true\b/.test(options))
        .map(([, name]) => name);

    assert.deepEqual(missing, [], \`Callables missing enforceAppCheck: true: \${missing.join(', ')}\`);
});
