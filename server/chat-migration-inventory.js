import { createHash } from 'node:crypto';

const MAX_UID_LENGTH = 128;
const MAX_MESSAGE_ID_LENGTH = 150;
const MAX_TEXT_LENGTH = 4000;
const PRODUCTION_PROJECT_IDS = new Set(['dream-and-go']);

export function assertSafeInventoryTarget({ projectId, allowedProjectId, confirmedNonProduction, ambientProjectId }) {
    if (!isValidFirestoreId(projectId)) throw new Error('Некорректный Firebase project ID');
    if (PRODUCTION_PROJECT_IDS.has(projectId)) throw new Error('Production Firebase project запрещён');
    if (confirmedNonProduction !== true) throw new Error('Требуется явное подтверждение non-production проекта');
    if (allowedProjectId !== projectId) throw new Error('Project ID не совпадает с CHAT_MIGRATION_ALLOWED_PROJECT_ID');
    if (ambientProjectId && ambientProjectId !== projectId) throw new Error('Project ID не совпадает с переменной окружения Google Cloud');
    return true;
}

export function isValidFirestoreId(value, maxLength = MAX_UID_LENGTH) {
    return typeof value === 'string' &&
        value.length > 0 &&
        value.length <= maxLength &&
        !value.includes('/') &&
        value !== '.' &&
        value !== '..';
}

export function canonicalChatId(uidA, uidB) {
    if (!isValidFirestoreId(uidA) || !isValidFirestoreId(uidB) || uidA === uidB) {
        throw new TypeError('Некорректная пара участников');
    }
    return createHash('sha256')
        .update([uidA, uidB].sort().join('\u0000'))
        .digest('hex');
}

export function legacyChatId(uidA, uidB) {
    if (!isValidFirestoreId(uidA) || !isValidFirestoreId(uidB) || uidA === uidB) {
        throw new TypeError('Некорректная пара участников');
    }
    return [uidA, uidB].sort().join('_');
}

function stableValue(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(stableValue);
    if (typeof value.toMillis === 'function') return { __timestampMillis: value.toMillis() };
    if (value instanceof Date) return { __timestampMillis: value.getTime() };
    return Object.fromEntries(
        Object.keys(value).sort().map(key => [key, stableValue(value[key])])
    );
}

export function stableJson(value) {
    return JSON.stringify(stableValue(value));
}

export function sha256(value) {
    return createHash('sha256').update(
        typeof value === 'string' ? value : stableJson(value)
    ).digest('hex');
}

function timestampMillis(value) {
    if (value && typeof value.toMillis === 'function') {
        const millis = value.toMillis();
        return Number.isFinite(millis) ? millis : null;
    }
    if (value instanceof Date) {
        const millis = value.getTime();
        return Number.isFinite(millis) ? millis : null;
    }
    if (Number.isSafeInteger(value) && value >= 0) return value;
    return null;
}

function parseSummaryPath(summary) {
    const parts = typeof summary.path === 'string' ? summary.path.split('/') : [];
    if (parts.length !== 4 || parts[0] !== 'users' || parts[2] !== 'chats') return null;
    return { ownerUid: parts[1], partnerDocId: parts[3] };
}

function pairKey(uidA, uidB) {
    return JSON.stringify([uidA, uidB].sort());
}

function directedSummaryKey(ownerUid, partnerUid) {
    return JSON.stringify([ownerUid, partnerUid]);
}

function inspectSummary(summary) {
    const data = summary.data || {};
    const issues = [];
    if (typeof data.lastMessage !== 'string') issues.push('invalid-summary-last-message');
    if (timestampMillis(data.lastMessageTime) === null) issues.push('invalid-summary-last-message-time');
    if (!Number.isSafeInteger(data.unread) || data.unread < 0) issues.push('invalid-summary-unread');
    if (timestampMillis(data.createdAt) === null) issues.push('invalid-summary-created-at');
    return issues.sort();
}

function summaryProjection(summary) {
    return {
        path: summary.path,
        documentId: summary.id,
        ownerUid: summary.ownerUid,
        partnerId: summary.data?.partnerId ?? null,
        unread: Number.isSafeInteger(summary.data?.unread) ? summary.data.unread : null,
        lastMessageTimeMillis: timestampMillis(summary.data?.lastMessageTime),
        sourceBytes: Buffer.byteLength(stableJson(summary.data || {})),
        issues: inspectSummary(summary),
        sourceSha256: sha256(summary.data || {})
    };
}

function inspectMessage(message, participants) {
    const data = message.data || {};
    const issues = [];
    if (!isValidFirestoreId(message.id, MAX_MESSAGE_ID_LENGTH)) issues.push('invalid-message-id');
    if (participants && !participants.includes(data.senderId)) issues.push('unknown-sender');
    if (!participants && !isValidFirestoreId(data.senderId)) issues.push('invalid-sender-id');
    if (typeof data.text !== 'string' || data.text.length === 0) issues.push('invalid-message-text');
    else if (data.text.length > MAX_TEXT_LENGTH) issues.push('message-text-over-limit');
    if (timestampMillis(data.createdAt) === null) issues.push('invalid-created-at');
    if (typeof data.read !== 'boolean') issues.push('invalid-read-flag');
    if (typeof data.edited !== 'boolean') issues.push('invalid-edited-flag');
    if (data.editedAt !== undefined && timestampMillis(data.editedAt) === null) {
        issues.push('invalid-edited-at');
    }

    return {
        id: message.id,
        senderId: typeof data.senderId === 'string' ? data.senderId : null,
        textLength: typeof data.text === 'string' ? data.text.length : null,
        textBytes: typeof data.text === 'string' ? Buffer.byteLength(data.text, 'utf8') : null,
        sourceBytes: Buffer.byteLength(stableJson(data)),
        createdAtMillis: timestampMillis(data.createdAt),
        sourceSha256: sha256(data),
        issues
    };
}

/**
 * Build a deterministic, read-only inventory from already-read Firestore documents.
 * Message text is never copied into the report; only field metadata and SHA-256 hashes are emitted.
 */
export function buildLegacyChatInventory({ summaries, messagesByChat, orphanMessageCollections = [] }) {
    const issues = [];
    const ignoredSummaryPaths = [];
    const normalizedSummaries = [];
    const skippedGroupSummaryPaths = [];
    const skippedV2SummaryPaths = [];
    const summariesByOwnerAndPartner = new Map();

    for (const summary of summaries) {
        const parsed = parseSummaryPath(summary);
        if (!parsed) {
            issues.push({ code: 'unexpected-summary-path', path: summary.path || null });
            continue;
        }
        if (parsed.partnerDocId === '_init' && !summary.data?.partnerId) {
            ignoredSummaryPaths.push(summary.path);
            continue;
        }
        if (summary.data?.isGroup === true) {
            skippedGroupSummaryPaths.push(summary.path);
            issues.push({ code: 'group-chat-out-of-scope', path: summary.path });
            continue;
        }
        const ownerUid = parsed.ownerUid;
        const partnerId = summary.data?.partnerId;
        if (summary.data?.type === 'private' &&
            typeof summary.data.chatId === 'string' &&
            summary.data.chatId === parsed.partnerDocId &&
            isValidFirestoreId(ownerUid) && isValidFirestoreId(partnerId) &&
            canonicalChatId(ownerUid, partnerId) === parsed.partnerDocId) {
            skippedV2SummaryPaths.push(summary.path);
            continue;
        }
        if (!isValidFirestoreId(ownerUid) || !isValidFirestoreId(partnerId) ||
            parsed.partnerDocId !== partnerId || ownerUid === partnerId) {
            issues.push({ code: 'invalid-summary-participants', path: summary.path });
            continue;
        }
        const normalized = {
            path: summary.path,
            id: summary.id || parsed.partnerDocId,
            ownerUid,
            partnerId,
            data: summary.data || {}
        };
        normalizedSummaries.push(normalized);
        summariesByOwnerAndPartner.set(directedSummaryKey(ownerUid, partnerId), normalized);
    }

    const candidatePairs = new Map();
    for (const summary of normalizedSummaries) {
        const key = pairKey(summary.ownerUid, summary.partnerId);
        if (!candidatePairs.has(key)) {
            candidatePairs.set(key, [summary.ownerUid, summary.partnerId].sort());
        }
    }

    const pairs = [];
    const candidateLegacyIds = new Set();
    const legacyIdOwners = new Map();

    for (const [key, participants] of candidatePairs) {
        const [uidA, uidB] = participants;
        const legacyId = legacyChatId(uidA, uidB);
        const canonicalId = canonicalChatId(uidA, uidB);
        candidateLegacyIds.add(legacyId);
        if (!legacyIdOwners.has(legacyId)) legacyIdOwners.set(legacyId, []);
        legacyIdOwners.get(legacyId).push(key);

        const summaryA = summariesByOwnerAndPartner.get(directedSummaryKey(uidA, uidB));
        const summaryB = summariesByOwnerAndPartner.get(directedSummaryKey(uidB, uidA));
        const pairIssues = [];
        if (!summaryA || !summaryB) pairIssues.push('missing-reciprocal-summary');
        for (const summary of [summaryA, summaryB].filter(Boolean)) {
            pairIssues.push(...inspectSummary(summary));
        }
        if (summaryA && summaryB) {
            if (summaryA.data?.lastMessage !== summaryB.data?.lastMessage ||
                timestampMillis(summaryA.data?.lastMessageTime) !== timestampMillis(summaryB.data?.lastMessageTime)) {
                pairIssues.push('reciprocal-summary-preview-mismatch');
            }
        }

        const chatMessages = messagesByChat?.[legacyId] || [];
        const seenMessageIds = new Set();
        const messageInventory = chatMessages.map(message => {
            const inspected = inspectMessage(message, participants);
            if (seenMessageIds.has(message.id)) inspected.issues.push('duplicate-message-id');
            seenMessageIds.add(message.id);
            for (const code of inspected.issues) {
                pairIssues.push(code);
            }
            return inspected;
        }).sort((a, b) => String(a.id).localeCompare(String(b.id)));

        if (messageInventory.length === 0) pairIssues.push('missing-or-empty-legacy-message-collection');

        const summaryDocs = [summaryA, summaryB].filter(Boolean).map(summaryProjection)
            .sort((a, b) => a.path.localeCompare(b.path));

        pairs.push({
            participants,
            legacyChatId: legacyId,
            canonicalChatId: canonicalId,
            sourceSummaryCount: summaryDocs.length,
            summaries: summaryDocs,
            messageCount: messageInventory.length,
            messages: messageInventory,
            issues: [...new Set(pairIssues)].sort()
        });
    }

    for (const [legacyId, owners] of legacyIdOwners) {
        if (owners.length > 1) {
            for (const pair of pairs.filter(item => item.legacyChatId === legacyId)) {
                pair.issues.push('legacy-chat-id-collision');
                pair.issues = [...new Set(pair.issues)].sort();
            }
            issues.push({ code: 'legacy-chat-id-collision', legacyChatId: legacyId, pairCount: owners.length });
        }
    }

    const orphanCollections = orphanMessageCollections
        .filter(collection => !candidateLegacyIds.has(collection.chatId))
        .map(collection => {
            const seen = new Set();
            const messages = (collection.messages || []).map(message => {
                const inspected = inspectMessage(message, null);
                if (seen.has(message.id)) inspected.issues.push('duplicate-message-id');
                seen.add(message.id);
                return inspected;
            }).sort((a, b) => String(a.id).localeCompare(String(b.id)));
            return {
                chatId: collection.chatId,
                messageCount: messages.length,
                totalSourceBytes: messages.reduce((sum, message) => sum + message.sourceBytes, 0),
                messages,
                issues: ['orphan-legacy-message-collection']
            };
        })
        .sort((a, b) => a.chatId.localeCompare(b.chatId));

    for (const orphan of orphanCollections) {
        issues.push({ code: 'orphan-legacy-message-collection', chatId: orphan.chatId, messageCount: orphan.messageCount });
    }

    pairs.sort((a, b) => a.canonicalChatId.localeCompare(b.canonicalChatId));
    issues.sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
    ignoredSummaryPaths.sort();
    skippedGroupSummaryPaths.sort();
    skippedV2SummaryPaths.sort();

    const totals = {
        summaryDocuments: normalizedSummaries.length,
        candidatePairs: pairs.length,
        reciprocalPairs: pairs.filter(pair => pair.sourceSummaryCount === 2).length,
        pairedMessageDocuments: pairs.reduce((sum, pair) => sum + pair.messageCount, 0),
        messageDocuments: pairs.reduce((sum, pair) => sum + pair.messageCount, 0) +
            orphanCollections.reduce((sum, item) => sum + item.messageCount, 0),
        pairsWithIssues: pairs.filter(pair => pair.issues.length > 0).length,
        globalIssues: issues.length,
        ignoredSentinelDocuments: ignoredSummaryPaths.length,
        skippedGroupSummaryDocuments: skippedGroupSummaryPaths.length,
        skippedV2SummaryDocuments: skippedV2SummaryPaths.length,
        orphanMessageCollections: orphanCollections.length,
        orphanMessageDocuments: orphanCollections.reduce((sum, item) => sum + item.messageCount, 0)
    };

    const manifest = {
        schemaVersion: 1,
        source: 'legacy-chat-read-only-inventory',
        totals,
        ignoredSummaryPaths,
        skippedGroupSummaryPaths,
        skippedV2SummaryPaths,
        orphanMessageCollections: orphanCollections,
        globalIssues: issues,
        pairs
    };

    return {
        manifest,
        manifestSha256: sha256(manifest),
        report: [
            '# Legacy Chat Inventory',
            '',
            'Mode: READ ONLY — no Firestore writes performed.',
            '',
            `- Summary documents: ${totals.summaryDocuments}`,
            `- Candidate participant pairs: ${totals.candidatePairs}`,
            `- Reciprocal pairs: ${totals.reciprocalPairs}`,
            `- Message documents (including orphans): ${totals.messageDocuments}`,
            `- Messages in validated participant pairs: ${totals.pairedMessageDocuments}`,
            `- Pairs with issues: ${totals.pairsWithIssues}`,
            `- Global issues: ${totals.globalIssues}`,
            `- Ignored sentinel documents: ${totals.ignoredSentinelDocuments}`,
            `- Group chat summaries skipped (out of scope): ${totals.skippedGroupSummaryDocuments}`,
            `- Existing Chat V2 summaries skipped: ${totals.skippedV2SummaryDocuments}`,
            `- Orphan message collections (manual review): ${totals.orphanMessageCollections}`,
            `- Orphan message documents: ${totals.orphanMessageDocuments}`,
            '',
            `Manifest SHA-256: ${sha256(manifest)}`,
            '',
            'No message text, email addresses, or profile fields are included in this report.',
            ''
        ].join('\n')
    };
}
