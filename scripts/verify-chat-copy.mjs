#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { compareMessageInventories } from '../server/chat-integrity.js';

// Strictly offline: this CLI reads two local files and writes only a summary to stdout.
if (process.argv.length !== 4) {
    console.error('Usage: npm run verify:chat-copy -- /path/to/source.json /path/to/target.json');
    process.exitCode = 2;
} else {
    try {
        const source = JSON.parse(readFileSync(process.argv[2], 'utf8'));
        const target = JSON.parse(readFileSync(process.argv[3], 'utf8'));
        const result = compareMessageInventories(source.messages, target.messages);
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        if (!result.equal) process.exitCode = 1;
    } catch (error) {
        console.error('Unable to verify local message exports:', error.message);
        process.exitCode = 2;
    }
}
