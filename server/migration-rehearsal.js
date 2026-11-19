import { canonicalMessageJson, compareMessageInventories } from './chat-integrity.js';

// Rehearsal ONLY: this module rejects all production environments and project IDs.
// Does not modify live chats, chat indexes, or access rules.
function assertDemoEnvironment(projectId, runId) {
    if (!process.env.FIRESTORE_EMULATOR_HOST ||
        projectId !== 'demo-dreamandgo-chat-rules' ||
        !/^[a-z0-9-]{1,64}$/.test(runId)) {
        throw new Error('Rehearsal requires the isolated Firestore emulator demo project');
    }
}

function toInventory(snapshot) {
    return snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
}

export async function rehearseChatCopy(db, { projectId, runId, stopAfter = Infinity }) {
    assertDemoEnvironment(projectId, runId);
    if (!(stopAfter === Infinity || Number.isSafeInteger(stopAfter) && stopAfter >= 0)) {
        throw new RangeError('stopAfter must be a non-negative integer');
    }
    const root = db.collection('migrationRehearsals').doc(runId);
    const source = root.collection('sourceMessages');
    const target = root.collection('targetMessages');
    const sourceSnapshot = await source.get();
    const sourceMessages = toInventory(sourceSnapshot);
    const sourceIDs = new Set(sourceMessages.map(row => row.id));
    // Never delete target documents. Stop on any unexpected extra message.
    const previous = toInventory(await target.get());
    for (const row of previous) {
        if (!sourceIDs.has(row.id)) throw new Error('Unexpected target message; manual review required');
        const original = sourceMessages.find(item => item.id === row.id);
        if (canonicalMessageJson(original.data) !== canonicalMessageJson(row.data)) {
            throw new Error('Existing target message differs from source; manual review required');
        }
    }

    let added = 0;
    for (const row of sourceMessages) {
        if (previous.some(item => item.id === row.id)) continue;
        if (added >= stopAfter) break;
        // create() is create-only: never overwrite a message after an interrupted run.
        try {
            await target.doc(row.id).create(row.data);
        } catch (error) {
            if (error.code !== 6 && error.code !== 'already-exists') throw error;
            const concurrent = await target.doc(row.id).get();
            if (!concurrent.exists ||
                canonicalMessageJson(concurrent.data()) !== canonicalMessageJson(row.data)) {
                throw new Error('Concurrent target message conflict; manual review required');
            }
        }
        added += 1;
    }

    const finalTarget = toInventory(await target.get());
    const comparison = compareMessageInventories(sourceMessages, finalTarget);
    if (comparison.sourceIssues.length || comparison.targetIssues.length || comparison.changed.length ||
        comparison.extra.length) {
        throw new Error('Rehearsal integrity verification failed');
    }
    return {
        mode: 'emulator_only',
        runId,
        sourceCount: comparison.sourceCount,
        copiedCount: comparison.targetCount,
        addedThisRun: added,
        status: comparison.equal ? 'rehearsal_verified' : 'paused',
        sourceDigest: comparison.sourceDigest,
        targetDigest: comparison.targetDigest,
        executable: false
    };
}
