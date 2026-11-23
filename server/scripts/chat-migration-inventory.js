#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildLegacyChatInventory, legacyChatId } from '../chat-migration-inventory.js';

const PRODUCTION_PROJECT_IDS = new Set(['dream-and-go']);

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
            if (!value || value.startsWith('--')) {
                throw new Error(`Для ${token} требуется значение`);
            }
            args[token.slice(2)] = value;
            index += 1;
            continue;
        }
        throw new Error(`Неизвестный аргумент: ${token}`);
    }
    return args;
}

function usage() {
    return [
        'Chat Migration Inspector — READ ONLY',
        '',
        'Usage:',
        '  CHAT_MIGRATION_ALLOWED_PROJECT_ID=<staging-project-id>\\',
        '    node server/scripts/chat-migration-inventory.js \\',
        '      --project-id <staging-project-id> \\',
        '      --output-dir <new-local-directory> \\',
        '      --confirm-non-production',
        '',
        'The project ID must match CHAT_MIGRATION_ALLOWED_PROJECT_ID exactly.',
        'The known production project "dream-and-go" is always blocked.',
        'No Firestore writes, deletes, or updates are performed.',
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
        throw new Error('Нужны --project-id, --output-dir и --confirm-non-production.\\n\\n' + usage());
    }
    if (PRODUCTION_PROJECT_IDS.has(projectId)) {
        throw new Error('Отказ: production Firebase project запрещён для этого инструмента.');
    }
    if (process.env.CHAT_MIGRATION_ALLOWED_PROJECT_ID !== projectId) {
        throw new Error('Отказ: CHAT_MIGRATION_ALLOWED_PROJECT_ID должен точно совпадать с --project-id.');
    }
    if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) {
        throw new Error('Отказ: GCLOUD_PROJECT не совпадает с явно указанным project ID.');
    }

    const resolvedOutputDir = path.resolve(outputDir);
    const app = initializeApp({ projectId }, `chat-migration-inspector-${projectId}`);
    const db = getFirestore(app);

    process.stdout.write(`Подключение только для чтения: ${projectId}\\n`);
    const summarySnapshot = await db.collectionGroup('chats').get();
    const summaries = summarySnapshot.docs.map(document => ({
        path: document.ref.path,
        id: document.id,
        data: document.data()
    }));

    const legacyIds = new Set();
    for (const summary of summaries) {
        const parts = summary.path.split('/');
        if (parts.length !== 4 || parts[0] !== 'users' || parts[2] !== 'chats') continue;
        const ownerUid = parts[1];
        const partnerUid = summary.data?.partnerId;
        if (typeof partnerUid !== 'string' || !partnerUid || ownerUid === partnerUid) continue;
        try {
            legacyIds.add(legacyChatId(ownerUid, partnerUid));
        } catch {
            // The pure inventory analyzer will report invalid summary participant IDs.
        }
    }

    const messagesByChat = {};
    for (const chatId of [...legacyIds].sort()) {
        const snapshot = await db.collection('chats').doc(chatId).collection('messages').get();
        messagesByChat[chatId] = snapshot.docs.map(document => ({
            id: document.id,
            data: document.data()
        }));
    }

    const inventory = buildLegacyChatInventory({ summaries, messagesByChat });
    await mkdir(resolvedOutputDir, { recursive: true });
    const manifestPath = path.join(resolvedOutputDir, 'legacy-chat-manifest.json');
    const reportPath = path.join(resolvedOutputDir, 'legacy-chat-report.md');
    await writeFile(manifestPath, JSON.stringify(inventory.manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await writeFile(reportPath, inventory.report, { flag: 'wx', mode: 0o600 });

    process.stdout.write(inventory.report);
    process.stdout.write(`\\nManifest saved: ${manifestPath}\\nReport saved: ${reportPath}\\n`);
    process.stdout.write('Firestore mode: READ ONLY. No document writes were issued.\\n');
}

main().catch(error => {
    process.stderr.write(`Chat Migration Inspector stopped: ${error.message}\\n`);
    process.exitCode = 1;
});
