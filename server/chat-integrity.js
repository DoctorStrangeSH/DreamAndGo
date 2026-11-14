import { createHash } from 'node:crypto';

// Strict deterministic encoding of JSON-exported Firestore message records.
// No lossy coercion or ignored fields; timestamps must be exported consistently.
export function canonicalMessageJson(value) {
    if (value === null) return 'null';
    if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new TypeError('Non-finite message value');
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        if (!Array.from({ length: value.length }, (_, i) => i).every(i => Object.hasOwn(value, i))) {
            throw new TypeError('Sparse arrays not allowed');
        }
        return '[' + value.map(canonicalMessageJson).join(',') + ']';
    }
    if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        return '{' + Object.keys(value).sort().map(key =>
            JSON.stringify(key) + ':' + canonicalMessageJson(value[key])
        ).join(',') + '}';
    }
    throw new TypeError('Unsupported message value type');
}

function digest(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function indexMessages(messages) {
    if (!Array.isArray(messages)) throw new TypeError('Expected array of exported messages');
    const records = new Map();
    const issues = [];
    for (const [position, row] of messages.entries()) {
        const id = row?.id;
        if (typeof id !== 'string' || !id || id.includes('/') || records.has(id)) {
            issues.push({ code: 'invalid_or_duplicate_message_id', position });
            continue;
        }
        const data = row?.data;
        if (!data || Object.getPrototypeOf(data) !== Object.prototype ||
            typeof data.senderId !== 'string' || !data.senderId ||
            typeof data.text !== 'string' || data.createdAt == null) {
            issues.push({ code: 'invalid_message_shape', messageId: id });
            continue;
        }
        try {
            const checksum = digest(canonicalMessageJson({ id, data }));
            records.set(id, checksum);
        } catch {
            issues.push({ code: 'unsupported_message_value', messageId: id });
        }
    }
    return { records, issues };
}

export function compareMessageInventories(source, target) {
    const original = indexMessages(source);
    const copied = indexMessages(target);
    const missing = [];
    const changed = [];
    const extra = [];
    for (const [id, checksum] of original.records) {
        if (!copied.records.has(id)) missing.push(id);
        else if (copied.records.get(id) !== checksum) changed.push(id);
    }
    for (const id of copied.records.keys()) {
        if (!original.records.has(id)) extra.push(id);
    }
    const sourceIssues = original.issues;
    const targetIssues = copied.issues;
    const isEqual = !sourceIssues.length && !targetIssues.length &&
        !missing.length && !changed.length && !extra.length &&
        original.records.size === copied.records.size;
    const inventoryDigest = records => digest(canonicalMessageJson(
        [...records.entries()].sort(([a], [b]) => a.localeCompare(b))
    ));
    return {
        equal: isEqual,
        sourceCount: source.length,
        targetCount: target.length,
        sourceDigest: inventoryDigest(original.records),
        targetDigest: inventoryDigest(copied.records),
        missing: missing.sort(),
        changed: changed.sort(),
        extra: extra.sort(),
        sourceIssues,
        targetIssues
    };
}
