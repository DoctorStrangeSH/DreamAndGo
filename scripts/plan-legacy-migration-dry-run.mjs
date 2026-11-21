#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { planLegacyMigrationDryRun } from '../js/core/legacy-migration-dry-run.js';

const [manifestPath, inventoryPath] = process.argv.slice(2);
if (!manifestPath || !inventoryPath || process.argv.length !== 4) {
    console.error('Usage: npm run plan:legacy-migration -- /path/to/manifest.json /path/to/sanitized-inventory.json');
    process.exitCode = 2;
} else {
    try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
        const report = planLegacyMigrationDryRun({ manifest, inventory });
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        if (report.status !== 'plan-only') process.exitCode = 1;
    } catch (error) {
        console.error('Cannot create legacy migration dry-run plan:', error.message);
        process.exitCode = 2;
    }
}
