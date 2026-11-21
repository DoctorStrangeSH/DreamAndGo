#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runLegacyMigrationRehearsal } from '../js/core/legacy-migration-rehearsal.js';

const [manifestPath, documentsPath] = process.argv.slice(2);
if (!manifestPath || !documentsPath || process.argv.length !== 4) {
    console.error('Usage: npm run rehearse:legacy-migration -- manifest.json synthetic-documents.json');
    process.exitCode = 2;
} else {
    try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const documents = JSON.parse(readFileSync(documentsPath, 'utf8'));
        const report = runLegacyMigrationRehearsal({ manifest, documents });
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        if (report.status !== 'passed') process.exitCode = 1;
    } catch (error) {
        console.error('Cannot run synthetic legacy migration rehearsal:', error.message);
        process.exitCode = 2;
    }
}
