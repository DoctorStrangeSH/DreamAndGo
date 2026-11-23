import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertOutputDirectoryOutsideRepository } from './chat-migration-paths.js';

test('migration output path rejects repository root and nested paths', async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'dreamandgo-paths-'));
    try {
        const repository = path.join(temp, 'repo');
        await mkdir(path.join(repository, 'server'), { recursive: true });
        await assert.rejects(
            assertOutputDirectoryOutsideRepository(repository, repository),
            /вне рабочей папки репозитория/
        );
        await assert.rejects(
            assertOutputDirectoryOutsideRepository(path.join(repository, 'server', 'reports'), repository),
            /вне рабочей папки репозитория/
        );
    } finally {
        await rm(temp, { recursive: true, force: true });
    }
});

test('migration output path rejects a symlink outside the repository that points back inside it', async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'dreamandgo-symlink-'));
    try {
        const repository = path.join(temp, 'repo');
        const outside = path.join(temp, 'outside');
        await mkdir(repository, { recursive: true });
        await mkdir(outside, { recursive: true });
        await symlink(repository, path.join(outside, 'repo-link'), 'dir');

        await assert.rejects(
            assertOutputDirectoryOutsideRepository(path.join(outside, 'repo-link', 'private-backup'), repository),
            /вне рабочей папки репозитория/
        );
    } finally {
        await rm(temp, { recursive: true, force: true });
    }
});

test('migration output path allows a genuinely external directory', async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'dreamandgo-external-'));
    try {
        const repository = path.join(temp, 'repo');
        const output = path.join(temp, 'private-backups', 'run-1');
        await mkdir(repository, { recursive: true });
        assert.equal(await assertOutputDirectoryOutsideRepository(output, repository), output);
    } finally {
        await rm(temp, { recursive: true, force: true });
    }
});
