#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { buildLegacyChatMigrationPlan } from '../server/legacy-migration-plan.js';

// Reads only exported local metadata. No Firebase connection or mutations.
const inputPath = process.argv[2];
if (!inputPath || process.argv.length !== 3) {
    console.error('Usage: npm run plan:legacy-chat -- /absolute/path/to/exported-metadata.json');
    process.exitCode = 2;
} else {
    try {
        const snapshot = JSON.parse(readFileSync(inputPath, 'utf8'));
        const plan = buildLegacyChatMigrationPlan(snapshot);
        process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
        if (plan.held.length || plan.summary.auditIssueCount) process.exitCode = 1;
    } catch (error) {
        console.error('Cannot build offline plan:', error.message);
        process.exitCode = 2;
    }
}
