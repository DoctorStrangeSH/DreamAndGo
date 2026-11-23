#!/usr/bin/env node
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
    assertSafeInventoryTarget,
    buildLegacyChatInventory,
    canonicalChatId,
    legacyChatId
} from '../chat-migration-inventory.js';
import { buildChatMigrationBackup, verifyChatMigrationBackup } from '../chat-migration-backup.js';

function readArguments(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === '--help' || token === '-h') {
            args.help = true;
            continue;
        }
        if (token === '--confirm-non-production') {
            args.confirmNonProduction = true;
            continue;
        }
        if (token.startsWith('--')) {
            const value = argv[index + 1];
            if (!value || value.startsWith('--')) throw new Error('Для ' + token + ' требуется значение');
            args[token.slice(2)] = value;
            index += 1;
            continue;
        }
        throw new Error('Неизвестный аргумент: ' + token);
    }
    return args;
}

function usage() {
    return [
        'Chat Migration Backup — READ ONLY FIRESTORE EXPORT',
        '',
        'Usage:',
        '  CHAT_MIGRATION_ALLOWED_PROJECT_ID=<staging-project-id>\\',
        '    node server/scripts/chat-migration-backup.js \\',
        '      --project-id <staging-project-id> \\',
        '      --output-dir <new-private-local-directory> \\',
        '      --confirm-non-production',
        '',
        'The exact project ID must match CHAT_MIGRATION_ALLOWED_PROJECT_ID.',
        'The known production project "dream-and-go" is always blocked.',
        'The output directory must not already exist.',
        'Firestore is read-only; no migration writes are performed.',
        ''
    ].join('\n');
}

async function main() {
    const args = readArguments(process.argv.slice(2));
    if (args.help) {
        process.stdout.write(usage());
        return;
    }
    const projectId = args['project-id'];
    const outputDir = args['output-dir'];
    if (!projectId || !outputDir || !args.confirmNonProduction) {
        throw new Error('Нужны --project-id, --output-dir и --confirm-non-production.\n\n' + usage());
    }
    assertSafeInventoryTarget({
        projectId,
        allowedProjectId: process.env.CHAT_MIGRATION_ALLOWED_PROJECT_ID,
        confirmedNonProduction: args.confirmNonProduction,
        ambientProjectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT
    });

    const resolvedOutputDir = path.resolve(outputDir);
    const relativeOutputPath = path.relative(process.cwd(), resolvedOutputDir);
    if (resolvedOutputDir === path.parse(resolvedOutputDir).root ||
        relativeOutputPath === '' ||
        (!relativeOutputPath.startsWith('..' + path.sep) && relativeOutputPath !== '..' && !path.isAbsolute(relativeOutputPath))) {
        throw new Error('Резервную копию нужно сохранять вне рабочей папки репозитория');
    }

    const app = initializeApp({ projectId: projectId }, 'chat-migration-backup-' + projectId);
    const db = getFirestore(app);
    process.stdout.write('Чтение staging-проекта только для чтения: ' + projectId + '\n');

    const summarySnapshot = await db.collectionGroup('chats').get();
    const summaryDocs = summarySnapshot.docs.filter(document =>
        /^users\/[^/]+\/chats\/[^/]+$/.test(document.ref.path)
    );
    const summaries = summaryDocs.map(document => ({
        path: document.ref.path,
        id: document.id,
        data: document.data()
    }));

    const legacyIds = new Set();
    const groupChatIds = new Set();
    for (const summary of summaries) {
        const parts = summary.path.split('/');
        if (summary.data?.isGroup === true) {
            groupChatIds.add(parts[3]);
            if (typeof summary.data.chatId === 'string') groupChatIds.add(summary.data.chatId);
            continue;
        }
        const partnerUid = summary.data?.partnerId;
        if (summary.data?.type === 'private' && summary.data.chatId === parts[3] &&
            typeof partnerUid === 'string' && canonicalChatId(parts[1], partnerUid) === parts[3]) continue;
        if (typeof partnerUid !== 'string' || !partnerUid || parts[1] === partnerUid) continue;
        try {
            legacyIds.add(legacyChatId(parts[1], partnerUid));
        } catch {
            // The inventory analyzer records malformed participant pairs.
        }
    }

    const messageSnapshot = await db.collectionGroup('messages').get();
    const messageDocs = messageSnapshot.docs.filter(document =>
        /^chats\/[^/]+\/messages\/[^/]+$/.test(document.ref.path)
    );
    const groupedMessages = new Map();
    for (const document of messageDocs) {
        const chatId = document.ref.path.split('/')[1];
        if (!groupedMessages.has(chatId)) groupedMessages.set(chatId, []);
        groupedMessages.get(chatId).push({ id: document.id, data: document.data() });
    }

    // Export every root chat parent, including chats with no message documents.
    // These documents contain metadata needed for a faithful restore and review.
    const parentSnapshot = await db.collection('chats').get();
    const parentDocs = parentSnapshot.docs;
    const parentById = new Map(parentDocs.map(document => [
        document.id,
        document.data() || {}
    ]));

    const messagesByChat = Object.fromEntries([...legacyIds].map(chatId => [chatId, []]));
    const orphanMessageCollections = [];
    for (const [chatId, messages] of groupedMessages) {
        const parent = parentById.get(chatId) || {};
        if (groupChatIds.has(chatId) || parent.isGroup === true || parent.schemaVersion === 2) continue;
        if (legacyIds.has(chatId)) messagesByChat[chatId] = messages;
        else orphanMessageCollections.push({ chatId, messages });
    }

    const inventory = buildLegacyChatInventory({
        summaries,
        messagesByChat,
        orphanMessageCollections
    });

    const documents = [...summaryDocs, ...parentDocs, ...messageDocs].map(document => ({
        path: document.ref.path,
        id: document.id,
        data: document.data()
    }));
    const backup = buildChatMigrationBackup({
        projectId,
        sourceManifestSha256: inventory.manifestSha256,
        documents
    });
    const verification = verifyChatMigrationBackup(backup);
    if (!verification.valid) {
        throw new Error('Резервная копия не прошла самопроверку: ' + verification.issues.join(', '));
    }

    await mkdir(resolvedOutputDir, { recursive: false, mode: 0o700 });
    await chmod(resolvedOutputDir, 0o700);
    const backupPath = path.join(resolvedOutputDir, 'legacy-chat-backup.json');
    const inventoryPath = path.join(resolvedOutputDir, 'legacy-chat-inventory.json');
    const reportPath = path.join(resolvedOutputDir, 'legacy-chat-backup-report.md');

    await writeFile(backupPath, JSON.stringify(backup, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await writeFile(inventoryPath, JSON.stringify({
        projectId,
        manifestSha256: inventory.manifestSha256,
        manifest: inventory.manifest
    }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    const report = [
        '# Legacy Chat Backup',
        '',
        'Mode: READ ONLY — no Firestore writes performed.',
        '- Firebase project: ' + projectId,
        '- Backed up Firestore documents (summaries, chat parents, messages): ' + backup.manifest.documentCount,
        '- Backup self-verification: PASS, all document and bundle checksums valid,
        '- Total source bytes: ' + backup.manifest.totalSourceBytes,
        '- Inventory SHA-256: ' + inventory.manifestSha256,
        '- Backup manifest SHA-256: ' + backup.manifestSha256,
        '- Backup bundle SHA-256: ' + backup.bundleSha256,
        '- Inventory issues requiring review: ' + (inventory.manifest.globalIssues.length + inventory.manifest.totals.pairsWithIssues),
        '',
        'The backup contains private message content. Store it securely and do not commit it to Git.',
        ''
    ].join('\n');
    await writeFile(reportPath, report, { flag: 'wx', mode: 0o600 });

    process.stdout.write(report);
    process.stdout.write('\nBackup: ' + backupPath + '\nInventory: ' + inventoryPath + '\nReport: ' + reportPath + '\n');
    process.stdout.write('Firestore mode: READ ONLY. No document writes were issued.\n');
}

main().catch(error => {
    process.stderr.write('Chat Migration Backup stopped: ' + error.message + '\n');
    process.exitCode = 1;
});
