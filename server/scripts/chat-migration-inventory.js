#!/usr/bin/env node
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { assertSafeInventoryTarget, buildLegacyChatInventory, legacyChatId } from '../chat-migration-inventory.js';

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
        throw new Error('Нужны --project-id, --output-dir и --confirm-non-production.\n\n' + usage());
    }
    assertSafeInventoryTarget({
        projectId,
        allowedProjectId: process.env.CHAT_MIGRATION_ALLOWED_PROJECT_ID,
        confirmedNonProduction: args.confirmNonProduction,
        ambientProjectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT
    });

    const resolvedOutputDir = path.resolve(outputDir);
    const app = initializeApp({ projectId }, `chat-migration-inspector-${projectId}`);
    const db = getFirestore(app);

    process.stdout.write(`Подключение только для чтения: ${projectId}\n`);
    const summarySnapshot = await db.collectionGroup('chats').get();
    const summaries = summarySnapshot.docs
        .filter(document => /^users\/[^/]+\/chats\/[^/]+$/.test(document.ref.path))
        .map(document => ({
        path: document.ref.path,
        id: document.id,
        data: document.data()
    }));

    const legacyIds = new Set();
    const groupChatIds = new Set();
    for (const summary of summaries) {
        const parts = summary.path.split('/');
        if (parts.length !== 4 || parts[0] !== 'users' || parts[2] !== 'chats') continue;
        if (summary.data?.isGroup === true) {
            groupChatIds.add(parts[3]);
            if (typeof summary.data.chatId === 'string') groupChatIds.add(summary.data.chatId);
            continue;
        }
        const ownerUid = parts[1];
        const partnerUid = summary.data?.partnerId;
        if (typeof partnerUid !== 'string' || !partnerUid || ownerUid === partnerUid) continue;
        try {
            legacyIds.add(legacyChatId(ownerUid, partnerUid));
        } catch {
            // The pure inventory analyzer will report invalid summary participant IDs.
        }
    }

    const messagesByChat = Object.fromEntries([...legacyIds].map(chatId => [chatId, []]));
    const orphanMessageCollections = [];
    const messageSnapshot = await db.collectionGroup('messages').get();
    const groupedMessages = new Map();
    for (const document of messageSnapshot.docs) {
        const parts = document.ref.path.split('/');
        if (parts.length !== 4 || parts[0] !== 'chats' || parts[2] !== 'messages') continue;
        const chatId = parts[1];
        if (!groupedMessages.has(chatId)) groupedMessages.set(chatId, []);
        groupedMessages.get(chatId).push({ id: document.id, data: document.data() });
    }

    for (const [chatId, messages] of groupedMessages) {
        if (groupChatIds.has(chatId)) continue;
        const parentChat = await db.collection('chats').doc(chatId).get();
        const parentData = parentChat.exists ? parentChat.data() || {} : {};
        if (parentData.schemaVersion === 2) continue;
        if (parentData.isGroup === true) continue;
        if (legacyIds.has(chatId)) {
            messagesByChat[chatId] = messages;
        } else {
            orphanMessageCollections.push({ chatId, messages });
        }
    }

    const inventory = buildLegacyChatInventory({ summaries, messagesByChat, orphanMessageCollections });
    await mkdir(resolvedOutputDir, { recursive: true, mode: 0o700 });
    await chmod(resolvedOutputDir, 0o700);
    const manifestPath = path.join(resolvedOutputDir, 'legacy-chat-manifest.json');
    const reportPath = path.join(resolvedOutputDir, 'legacy-chat-report.md');
    await writeFile(manifestPath, JSON.stringify(inventory.manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await writeFile(reportPath, inventory.report, { flag: 'wx', mode: 0o600 });

    process.stdout.write(inventory.report);
    process.stdout.write(`\nManifest saved: ${manifestPath}\nReport saved: ${reportPath}\n`);
    process.stdout.write('Firestore mode: READ ONLY. No document writes were issued.\n');
}

main().catch(error => {
    process.stderr.write(`Chat Migration Inspector stopped: ${error.message}\n`);
    process.exitCode = 1;
});
