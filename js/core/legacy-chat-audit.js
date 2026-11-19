// Conservative, read-only audit of exported legacy chat metadata.
// Never infer membership from a chat ID alone.
function validUid(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
        !value.includes('/');
}
export function legacyChatId(firstUid, secondUid) {
    if (!validUid(firstUid) || !validUid(secondUid) || firstUid === secondUid) return null;
    return [firstUid, secondUid].sort().join('_');
}
function pairKey(firstUid, secondUid) {
    return JSON.stringify([firstUid, secondUid].sort());
}

export function auditLegacyChatSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.chatIndexes) || !Array.isArray(snapshot.legacyChats)) {
        throw new TypeError('Expected { chatIndexes: [], legacyChats: [] }');
    }
    const issues = [];
    const pairs = new Map();
    const chats = new Map();
    const idToPairs = new Map();
    const invalidChats = new Set();
    const duplicateViews = new Set();

    for (const [position, row] of snapshot.legacyChats.entries()) {
        if (!row || typeof row.id !== 'string' || !row.id || row.id.includes('/') || chats.has(row.id)) {
            issues.push({ code: 'invalid_or_duplicate_chat', position });
            if (typeof row?.id === 'string' && chats.has(row.id)) invalidChats.add(row.id);
            continue;
        }
        if (row.messageCount !== undefined &&
            (!Number.isSafeInteger(row.messageCount) || row.messageCount < 0)) {
            issues.push({ code: 'invalid_message_count', chatId: row.id });
            invalidChats.add(row.id);
        }
        if (row.senderIds !== undefined &&
            (!Array.isArray(row.senderIds) || !row.senderIds.every(validUid))) {
            issues.push({ code: 'invalid_sender_list', chatId: row.id });
            invalidChats.add(row.id);
        }
        chats.set(row.id, row);
    }

    for (const [position, row] of snapshot.chatIndexes.entries()) {
        const owner = row?.ownerUid;
        const partner = row?.partnerUid;
        const id = legacyChatId(owner, partner);
        if (!id) {
            issues.push({ code: 'invalid_index', position });
            continue;
        }
        if (row.chatId !== undefined && row.chatId !== id) {
            issues.push({ code: 'index_chat_id_mismatch', position, expectedChatId: id });
            continue;
        }
        const key = pairKey(owner, partner);
        if (!pairs.has(key)) pairs.set(key, { chatId: id, members: [owner, partner].sort(), views: new Set() });
        const record = pairs.get(key);
        if (record.views.has(owner)) {
            issues.push({ code: 'duplicate_index_view', chatId: id, ownerUid: owner });
            duplicateViews.add(key);
        }
        record.views.add(owner);
        if (!idToPairs.has(id)) idToPairs.set(id, new Set());
        idToPairs.get(id).add(key);
    }

    const safePairs = [];
    const needsReview = [];
    for (const [key, record] of pairs) {
        const reasons = [];
        const [first, second] = record.members;
        if (!record.views.has(first) || !record.views.has(second)) reasons.push('missing_reciprocal_index');
        if (!chats.has(record.chatId)) reasons.push('missing_legacy_chat_document');
        if (invalidChats.has(record.chatId)) reasons.push('invalid_legacy_chat_metadata');
        if (duplicateViews.has(key)) reasons.push('duplicate_index_view');
        if (idToPairs.get(record.chatId).size > 1) reasons.push('ambiguous_legacy_chat_id');
        const chat = chats.get(record.chatId);
        if (Array.isArray(chat?.senderIds) && chat.senderIds.some(uid => !record.members.includes(uid))) {
            reasons.push('unexpected_message_sender');
        }
        const entry = { chatId: record.chatId, members: record.members, messageCount: chat?.messageCount ?? null };
        if (reasons.length) needsReview.push({ ...entry, reasons });
        else safePairs.push(entry);
    }
    const unreferencedChatIds = [...chats.keys()].filter(id => !idToPairs.has(id)).sort();
    for (const chatId of unreferencedChatIds) issues.push({ code: 'unreferenced_legacy_chat', chatId });
    return {
        safePairs: safePairs.sort((a, b) => a.chatId.localeCompare(b.chatId)),
        needsReview: needsReview.sort((a, b) => a.chatId.localeCompare(b.chatId)),
        issues,
        unreferencedChatIds,
        summary: {
            totalLegacyChats: chats.size,
            totalCandidatePairs: pairs.size,
            safePairCount: safePairs.length,
            reviewPairCount: needsReview.length,
            issueCount: issues.length
        }
    };
}
