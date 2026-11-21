#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { validateLegacyMigrationManifest } from '../js/core/legacy-migration-manifest.js';

const inputPath = process.argv[2];
if (!inputPath || process.argv.length !== 3) {
    console.error('Usage: npm run validate:legacy-migration -- /path/to/manifest.json');
    process.exitCode = 2;
} else {
    try {
        const manifest = JSON.parse(readFileSync(inputPath, 'utf8'));
        const result = validateLegacyMigrationManifest(manifest);
        process.stdout.write(JSON.stringify({
            mode: 'offline-manifest-validation',
            migrationApplied: false,
            valid: result.valid,
            ready: result.ready,
            errors: result.errors
        }, null, 2) + '\n');
        if (!result.valid || !result.ready) process.exitCode = 1;
    } catch (error) {
        console.error('Cannot validate legacy migration manifest:', error.message);
        process.exitCode = 2;
    }
}
