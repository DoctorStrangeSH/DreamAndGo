import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChatMigrationBackup } from './chat-migration-backup.js';
import { buildLegacyChatInventory } from './chat-migration-inventory.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'scripts', 'chat-migration-backup-verify.js');

function run(args) {
    return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

async function fixture() {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dreamandgo-backup-verify-'));
    const sourceInventory = buildLegacyChatInventory({ projectId: 'dream-and-go-staging', summaries: [], messagesByChat: {} });
    const sourceManifestSha256 = sourceInventory.manifestSha256;
    const backup = buildChatMigrationBackup({
        projectId: 'dream-and-go-staging',
        sourceManifestSha256,
        documents: [{
            path: 'chats/alice_bob/messages/message-1',
            id: 'message-1',
            data: { senderId: 'alice', text: 'synthetic fixture only' }
        }]
    });
    const inventory = {
        projectId: 'dream-and-go-staging',
        manifestSha256: sourceManifestSha256,
        manifest: sourceInventory.manifest
    };
    const backupPath = path.join(directory, 'backup.json');
    const inventoryPath = path.join(directory, 'inventory.json');
    await writeFile(backupPath, JSON.stringify(backup));
    await writeFile(inventoryPath, JSON.stringify(inventory));
    return { directory, backupPath, inventoryPath };
}

test('offline verifier reads both files and validates document, bundle and inventory linkage', async () => {
    const files = await fixture();
    try {
        const result = run(['--backup', files.backupPath, '--inventory', files.inventoryPath]);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /BACKUP VERIFICATION: PASS/);
        assert.match(result.stdout, /OFFLINE READ ONLY/);
    } finally {
        await rm(files.directory, { recursive: true, force: true });
    }
});

test('offline verifier rejects tampered backup content', async () => {
    const files = await fixture();
    try {
        const backup = JSON.parse(await readFile(files.backupPath, 'utf8'));
        backup.records[0].data.text = 'tampered';
        await writeFile(files.backupPath, JSON.stringify(backup));
        const result = run(['--backup', files.backupPath, '--inventory', files.inventoryPath]);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /document-checksum-mismatch|bundle-checksum-mismatch/);
    } finally {
        await rm(files.directory, { recursive: true, force: true });
    }
});

test('offline verifier rejects inventory from another project or inventory checksum', async () => {
    const files = await fixture();
    try {
        const inventory = JSON.parse(await readFile(files.inventoryPath, 'utf8'));
        inventory.projectId = 'different-staging-project';
        inventory.manifestSha256 = 'b'.repeat(64);
        await writeFile(files.inventoryPath, JSON.stringify(inventory));
        const result = run(['--backup', files.backupPath, '--inventory', files.inventoryPath]);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /project-id-mismatch/);
        assert.match(result.stderr, /source-inventory-checksum-mismatch/);
    } finally {
        await rm(files.directory, { recursive: true, force: true });
    }
});

test('offline verifier rejects modified inventory manifest even when its stored checksum is unchanged', async () => {
    const files = await fixture();
    try {
        const inventory = JSON.parse(await readFile(files.inventoryPath, 'utf8'));
        inventory.manifest.totals.candidatePairs = 999;
        await writeFile(files.inventoryPath, JSON.stringify(inventory));
        const result = run(['--backup', files.backupPath, '--inventory', files.inventoryPath]);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /inventory-manifest-checksum-mismatch/);
    } finally {
        await rm(files.directory, { recursive: true, force: true });
    }
});
