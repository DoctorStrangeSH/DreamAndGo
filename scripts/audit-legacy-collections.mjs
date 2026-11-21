#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { auditLegacyCollectionSnapshot } from '../js/core/legacy-collection-audit.js';

// Offline only: consumes a locally exported, minimized metadata snapshot.
// It never connects to Firebase and never writes or migrates documents.
const inputPath = process.argv[2];
if (!inputPath || process.argv.length !== 3) {
    console.error('Usage: npm run audit:legacy-collections -- /path/to/minimized-export.json');
    process.exitCode = 2;
} else {
    try {
        const snapshot = JSON.parse(readFileSync(inputPath, 'utf8'));
        const report = auditLegacyCollectionSnapshot(snapshot);
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        if (report.summary.invalidRecords || report.summary.missingCreatedAt ||
            report.summary.missingUpdatedAt || report.summary.missingRequiredFields ||
            report.summary.unknownFieldDocuments || report.summary.invalidStatus ||
            report.summary.invalidTimestampDocuments || report.summary.fieldTypeMismatches) {
            process.exitCode = 1;
        }
    } catch (error) {
        console.error('Cannot audit legacy collection snapshot:', error.message);
        process.exitCode = 2;
    }
}
