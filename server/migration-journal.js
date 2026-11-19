import { createHash } from 'node:crypto';
import { compareMessageInventories } from './chat-integrity.js';

// Offline-only checkpoint journal. No Firebase client, no writes, no production approval.
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function createMigrationJournal(plan, sourceChatId) {
    if (plan?.kind !== 'dreamandgo-chat-migration-dry-run-v1' ||
        plan.executable !== false || !validDigest(plan.inputFingerprint)) {
        throw new TypeError('Expected a non-executable dry-run migration plan');
    }
    if (!Array.isArray(plan.candidates) || !Array.isArray(plan.held) ||
        plan.held.some(row => row.sourceChatId === sourceChatId)) {
        throw new Error('Source is held or plan is invalid');
    }
    const matches = plan.candidates.filter(row => row.sourceChatId === sourceChatId);
    if (matches.length !== 1) throw new Error('Exactly one eligible source is required');
    const candidate = matches[0];
    if (!Number.isSafeInteger(candidate.sourceMessageCount) || candidate.sourceMessageCount < 0 ||
        candidate.targetChatId !== null || typeof candidate.targetPairKey !== 'string') {
        throw new TypeError('Incomplete migration candidate');
    }
    return {
        kind: 'dreamandgo-chat-copy-journal-v1',
        mode: 'offline_rehearsal_only',
        planFingerprint: plan.inputFingerprint,
        candidateFingerprint: hash(candidate),
        sourceChatId,
        expectedCount: candidate.sourceMessageCount,
        status: 'pending',
        copiedCount: 0,
        sourceDigest: null,
        targetDigest: null,
        executable: false
    };
}

function ensureJournal(journal) {
    if (journal?.kind !== 'dreamandgo-chat-copy-journal-v1' ||
        journal.mode !== 'offline_rehearsal_only' || journal.executable !== false ||
        !validDigest(journal.planFingerprint) || !validDigest(journal.candidateFingerprint) ||
        typeof journal.sourceChatId !== 'string' ||
        !Number.isSafeInteger(journal.expectedCount) || journal.expectedCount < 0 ||
        !Number.isSafeInteger(journal.copiedCount) || journal.copiedCount < 0 ||
        journal.copiedCount > journal.expectedCount) {
        throw new TypeError('Invalid migration journal');
    }
}

export function recordCopyCheckpoint(journal, { copiedCount, plan, sourceChatId } = {}) {
    ensureJournal(journal);
    const baseline = createMigrationJournal(plan, sourceChatId);
    if (journal.planFingerprint !== baseline.planFingerprint ||
        journal.candidateFingerprint !== baseline.candidateFingerprint ||
        journal.sourceChatId !== baseline.sourceChatId ||
        journal.expectedCount !== baseline.expectedCount) {
        throw new Error('Plan or candidate changed; checkpoint cannot be resumed');
    }
    if (!['pending', 'copying'].includes(journal.status)) {
        throw new Error('Verified journal cannot be advanced');
    }
    if (!Number.isSafeInteger(copiedCount) || copiedCount < journal.copiedCount ||
        copiedCount > journal.expectedCount) {
        throw new RangeError('Checkpoint must be monotonic and within source count');
    }
    return { ...journal, copiedCount, status: 'copying', sourceDigest: null, targetDigest: null };
}

export function verifyCopyCheckpoint(journal, source, target, plan) {
    ensureJournal(journal);
    const baseline = createMigrationJournal(plan, journal.sourceChatId);
    if (journal.planFingerprint !== baseline.planFingerprint ||
        journal.candidateFingerprint !== baseline.candidateFingerprint ||
        journal.expectedCount !== baseline.expectedCount) {
        throw new Error('Source plan changed during rehearsal');
    }
    if (journal.status !== 'copying' || journal.copiedCount !== journal.expectedCount) {
        throw new Error('Incomplete checkpoint cannot be verified');
    }
    const comparison = compareMessageInventories(source, target);
    if (comparison.sourceCount !== journal.expectedCount || !comparison.equal) {
        throw new Error('Source count or message integrity mismatch');
    }
    return {
        ...journal,
        status: 'rehearsal_verified',
        sourceDigest: comparison.sourceDigest,
        targetDigest: comparison.targetDigest,
        // This does NOT approve backup, permission rules, deployment or cutover.
        executable: false
    };
}
