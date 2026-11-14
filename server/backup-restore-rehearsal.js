import { compareMessageInventories } from './chat-integrity.js';

// Emulator-only restore drill. Backup is an in-memory snapshot, not a durable backup.
const DEMO_PROJECT = 'demo-dreamandgo-chat-rules';
function guard(projectId, runId) {
    if (!process.env.FIRESTORE_EMULATOR_HOST || projectId !== DEMO_PROJECT ||
        typeof runId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(runId)) {
        throw new Error('Restore rehearsal requires the isolated emulator demo project');
    }
}
const rows = snapshot => snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));

export async function rehearseBackupRestore(db, { projectId, runId }) {
    guard(projectId, runId);
    const root = db.collection('migrationRehearsals').doc(runId);
    const original = rows(await root.collection('sourceMessages').get());
    // Snapshot first, verify source structure and fail closed before writing.
    const baseline = compareMessageInventories(original, original);
    if (!baseline.equal) throw new Error('Source backup inventory is invalid');

    const restoreCollection = root.collection('restoredMessages');
    const existing = rows(await restoreCollection.get());
    const preflight = compareMessageInventories(original, existing);
    if (preflight.changed.length || preflight.extra.length || preflight.targetIssues.length) {
        throw new Error('Existing restore conflicts with backup');
    }
    for (const message of original) {
        if (!preflight.missing.includes(message.id)) continue;
        try {
            await restoreCollection.doc(message.id).create(message.data);
        } catch (error) {
            if (error.code !== 6 && error.code !== 'already-exists') throw error;
            const concurrent = rows(await restoreCollection.get());
            if (!compareMessageInventories(original, concurrent).equal) {
                throw new Error('Concurrent restore conflict');
            }
        }
    }
    const comparison = compareMessageInventories(original, rows(await restoreCollection.get()));
    if (!comparison.equal) throw new Error('Restore integrity mismatch');
    return {
        mode: 'emulator_only', status: 'restore_rehearsal_verified',
        sourceCount: comparison.sourceCount,
        sourceDigest: comparison.sourceDigest,
        restoredDigest: comparison.targetDigest,
        executable: false,
        durableBackupVerified: false
    };
}
