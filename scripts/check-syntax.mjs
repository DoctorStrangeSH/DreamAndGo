import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';
import process from 'node:process';

const roots = ['js', 'server', 'scripts', 'tests'];
const extensions = new Set(['.js', '.mjs', '.cjs']);
const files = [];

async function collect(directory) {
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
        if (error.code === 'ENOENT') return;
        throw error;
    }

    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
                await collect(path);
            }
            continue;
        }

        const extension = path.slice(path.lastIndexOf('.'));
        if (entry.isFile() && extensions.has(extension)) files.push(path);
    }
}

for (const root of roots) await collect(root);
files.sort();

if (files.length === 0) {
    console.error('No JavaScript source files found for syntax validation.');
    process.exit(1);
}

let failed = 0;
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
        failed += 1;
        console.error(`\nSyntax check failed: ${relative(process.cwd(), file)}`);
        if (result.stdout) process.stderr.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
    }
}

if (failed > 0) {
    console.error(`\n${failed} of ${files.length} JavaScript files failed syntax validation.`);
    process.exit(1);
}

console.log(`Syntax check passed for all ${files.length} JavaScript files across ${roots.join(', ')}.`);
