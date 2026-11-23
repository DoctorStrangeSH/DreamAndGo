import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildChatMigrationBackup } from './chat-migration-backup.js';
import { sha256 } from './chat-migration-inventory.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'scripts', 'chat-migration-backup-verify.js');

function run(args) {
    return spawnSync(process.execPath, [script, ...args], {
        encoding: 'utf8'
    });
}

async function createFixture(directory, projectId = 'dream-and-go-staging') {
    const manifest = {};
    const manifestSha256 = sha256(manifest);
    const backup = buildChatMigrationBackup({
        projectId,
        sourceManifestSha256: manifestSha256,
        documents: [{
            path: 'users/alice/chats/bob',
            id: 'bob',
            data: { partnerId: 'bob', unread: 0 }
        }]
    });
    const inventory = { projectId, manifestSha256, manifest };
    const backupPath = path.join(directory, 'backup.json');
    const inventoryPath = path.join(directory, 'inventory.json');
    await writeFile(backupPath, JSON.stringify(backup));
    await writeFile(inventoryPath, JSON.stringify(inventory));
    return { backupPath, inventoryPath };
}

test('offline verifier accepts a valid backup and matching inventory project', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dreamandgo-backup-verify-'));
    try {
        const files = await createFixture(directory);
        const result = run(['--backup', files.backupPath, '--inventory', files.inventoryPath]);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /BACKUP VERIFICATION: PASS/);
        assert.match(result.stdout, /Project: dream-and-go-staging/);
        assert.match(result.stdout, /Documents: 1/);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('offline verifier rejects an inventory from a different Firebase project', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dreamandgo-backup-verify-'));
    try {
        const files = await createFixture(directory, 'dream-and-go-staging');
        const inventory = JSON.parse(await readFile(files.inventoryPath, 'utf8'));
        inventory.projectId = 'another-staging-project';
        await writeFile(files.inventoryPath, JSON.stringify(inventory));
        const result = run(['--backup', files.backupPath, '--inventory', files.inventoryPath]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /project-id-mismatch/);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('offline verifier help does not require Firebase credentials', () => {
    const result = run(['--help']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /OFFLINE READ-BACK VERIFICATION/);
});
