import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'scripts', 'chat-migration-backup.js');

function run(args, env = {}) {
    return spawnSync(process.execPath, [script, ...args], {
        encoding: 'utf8',
        env: { ...process.env, ...env }
    });
}

test('backup CLI help is available without initializing Firebase', () => {
    const result = run(['--help']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /READ ONLY FIRESTORE EXPORT/);
});

test('backup CLI refuses the known production Firebase project before connecting', () => {
    const result = run([
        '--project-id', 'dream-and-go',
        '--output-dir', path.join(path.dirname(here), 'should-not-be-created'),
        '--confirm-non-production'
    ], {
        CHAT_MIGRATION_ALLOWED_PROJECT_ID: 'dream-and-go'
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /production|Production|prod/i);
    assert.doesNotMatch(result.stderr, /Could not load the default credentials|credential/i);
});

test('backup CLI requires explicit non-production confirmation before connecting', () => {
    const result = run([
        '--project-id', 'dream-and-go-staging',
        '--output-dir', path.join(path.dirname(here), 'should-not-be-created')
    ], {
        CHAT_MIGRATION_ALLOWED_PROJECT_ID: 'dream-and-go-staging'
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /confirm-non-production/);
    assert.doesNotMatch(result.stderr, /Could not load the default credentials|credential/i);
});
