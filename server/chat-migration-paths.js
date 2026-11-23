import { realpath } from 'node:fs/promises';
import path from 'node:path';

function isWithin(parent, candidate) {
    const relative = path.relative(parent, candidate);
    return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

export async function assertOutputDirectoryOutsideRepository(outputDir, repositoryRoot) {
    const resolvedOutput = path.resolve(outputDir);
    const resolvedRepository = await realpath(repositoryRoot);

    if (resolvedOutput === path.parse(resolvedOutput).root || isWithin(resolvedRepository, resolvedOutput)) {
        throw new Error('Отчёты и резервные копии нужно сохранять вне рабочей папки репозитория');
    }

    let existingAncestor = resolvedOutput;
    while (true) {
        try {
            const actualAncestor = await realpath(existingAncestor);
            if (isWithin(resolvedRepository, actualAncestor)) {
                throw new Error('Отчёты и резервные копии нужно сохранять вне рабочей папки репозитория');
            }
            return resolvedOutput;
        } catch (error) {
            if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error;
            const parent = path.dirname(existingAncestor);
            if (parent === existingAncestor) throw error;
            existingAncestor = parent;
        }
    }
}
