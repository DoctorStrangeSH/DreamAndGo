#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { auditLegacyMigrationIntegrity } from '../js/core/legacy-migration-integrity.js';

const [manifestPath, sourcePath, normalizedPath] = process.argv.slice(2);
if (!manifestPath || !sourcePath || !normalizedPath || process.argv.length !== 5) {
    console.error('Usage: npm run audit:legacy-migration-integrity -- manifest.json source-documents.json normalized-documents.json');
    process.exitCode = 2;
} else {
    try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const sourceDocuments = JSON.parse(readFileSync(sourcePath, 'utf8'));
        const normalizedDocuments = JSON.parse(readFileSync(normalizedPath, 'utf8'));
        const report = auditLegacyMigrationIntegrity({ manifest, sourceDocuments, normalizedDocuments });
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        if (!report.passed) process.exitCode = 1;
    } catch (error) {
        console.error('Cannot audit legacy migration integrity:', error.message);
        process.exitCode = 2;
    }
}
