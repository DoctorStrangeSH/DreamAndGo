#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyChatMigrationBackup } from '../chat-migration-backup.js';
import { verifyLegacyChatInventoryManifest } from '../chat-migration-inventory.js';

function readArguments(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === '--help' || token === '-h') {
            args.help = true;
            continue;
        }
        if (!token.startsWith('--')) throw new Error('Неизвестный аргумент: ' + token);
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) throw new Error('Для ' + token + ' требуется значение');
        args[token.slice(2)] = value;
        index += 1;
    }
    return args;
}

function usage() {
    return [
        'Chat Migration Backup — OFFLINE READ-BACK VERIFICATION',
        '',
        'Usage:',
        '  node server/scripts/chat-migration-backup-verify.js \\',
        '    --backup <legacy-chat-backup.json> \\',
        '    --inventory <legacy-chat-inventory.json>',
        '',
        'Reads local files only. Does not connect to Firebase or write any data.',
        ''
    ].join('\n');
}

async function main() {
    const args = readArguments(process.argv.slice(2));
    if (args.help) {
        process.stdout.write(usage());
        return;
    }
    if (!args.backup || !args.inventory) {
        throw new Error('Нужны --backup и --inventory.\n\n' + usage());
    }
    const backupPath = path.resolve(args.backup);
    const inventoryPath = path.resolve(args.inventory);
    const [backupText, inventoryText] = await Promise.all([
        readFile(backupPath, 'utf8'),
        readFile(inventoryPath, 'utf8')
    ]);
    const backup = JSON.parse(backupText);
    const inventory = JSON.parse(inventoryText);
    const verification = verifyChatMigrationBackup(backup);
    const issues = [...verification.issues];
    if (inventory.projectId !== backup.manifest?.projectId) issues.push('project-id-mismatch');
    if (inventory.manifestSha256 !== backup.manifest?.sourceManifestSha256) issues.push('source-inventory-checksum-mismatch');
    const inventoryVerification = verifyLegacyChatInventoryManifest(inventory.manifest, inventory.manifestSha256);
    issues.push(...inventoryVerification.issues);

    if (issues.length) {
        process.stderr.write('BACKUP VERIFICATION: FAILED\n' + [...new Set(issues)].sort().map(issue => '- ' + issue).join('\n') + '\n');
        process.exitCode = 1;
        return;
    }

    process.stdout.write([
        'BACKUP VERIFICATION: PASS',
        'Project: ' + backup.projectId,
        'Documents: ' + backup.manifest.documentCount,
        'Source bytes: ' + backup.manifest.totalSourceBytes,
        'Inventory SHA-256: ' + inventory.manifestSha256,
        'Backup manifest SHA-256: ' + backup.manifestSha256,
        'Backup bundle SHA-256: ' + backup.bundleSha256,
        'Read-back: parsed both files and verified all document, backup manifest, bundle and inventory manifest checksums.',
        'Mode: OFFLINE READ ONLY — no Firebase connection or writes.'
    ].join('\n') + '\n');
}

main().catch(error => {
    process.stderr.write('Backup verification stopped: ' + error.message + '\n');
    process.exitCode = 1;
});
