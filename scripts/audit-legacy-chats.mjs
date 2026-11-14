#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { auditLegacyChatSnapshot } from '../js/core/legacy-chat-audit.js';

const inputPath = process.argv[2];
if (!inputPath || process.argv.length !== 3) {
    console.error('Usage: node scripts/audit-legacy-chats.mjs /path/to/exported-chat-metadata.json');
    process.exitCode = 2;
} else {
    try {
        const snapshot = JSON.parse(readFileSync(inputPath, 'utf8'));
        const report = auditLegacyChatSnapshot(snapshot);
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        // No pair is considered migration-ready if any related index or source is ambiguous.
        if (report.needsReview.length || report.issues.length) process.exitCode = 1;
    } catch (error) {
        console.error('Cannot audit exported metadata:', error.message);
        process.exitCode = 2;
    }
}
