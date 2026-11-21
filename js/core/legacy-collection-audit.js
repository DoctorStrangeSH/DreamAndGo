const SCHEMAS = Object.freeze({
    dreams: {
        allowed: new Set(['title', 'category', 'status', 'description', 'progress', 'deadline', 'steps', 'createdAt', 'updatedAt']),
        required: ['title'],
        statuses: new Set(['dreaming', 'in_progress', 'completed'])
    },
    travels: {
        allowed: new Set(['title', 'type', 'status', 'location', 'description', 'budget', 'rating', 'notes', 'photos', 'createdAt', 'updatedAt']),
        required: ['title', 'type', 'status'],
        statuses: new Set(['planned', 'visited'])
    },
    books: {
        allowed: new Set(['title', 'author', 'status', 'genres', 'year', 'totalPages', 'currentPage', 'userRating', 'review', 'quotes', 'notes', 'createdAt', 'updatedAt']),
        required: ['title', 'author', 'status'],
        statuses: new Set(['want_to_read', 'reading', 'read'])
    },
    movies: {
        allowed: new Set(['movieId', 'title', 'originalTitle', 'overview', 'poster', 'backdrop', 'voteAverage', 'voteCount', 'rating', 'releaseDate', 'genreIds', 'runtime', 'tagline', 'budget', 'productionCountries', 'status', 'userRating', 'review', 'notes', 'createdAt', 'updatedAt']),
        required: ['movieId', 'title', 'status'],
        statuses: new Set(['to_watch', 'watched'])
    },
    restaurants: {
        allowed: new Set(['name', 'cuisine', 'status', 'address', 'visitDate', 'avgBill', 'userRating', 'favoriteDishes', 'review', 'photos', 'notes', 'createdAt', 'updatedAt']),
        required: ['name', 'cuisine', 'status'],
        statuses: new Set(['want_to_visit', 'visited'])
    }
});

const FIRESTORE_TIMESTAMP_MIN_SECONDS = -62_135_596_800;
const FIRESTORE_TIMESTAMP_MAX_SECONDS = 253_402_300_799;

function isTimestamp(value) {
    if (value instanceof Date) return Number.isFinite(value.getTime());
    return Boolean(value && typeof value === 'object' &&
        Number.isInteger(value.seconds) &&
        Number.isInteger(value.nanoseconds) &&
        value.seconds >= FIRESTORE_TIMESTAMP_MIN_SECONDS &&
        value.seconds <= FIRESTORE_TIMESTAMP_MAX_SECONDS &&
        value.nanoseconds >= 0 &&
        value.nanoseconds < 1_000_000_000);
}

function coarseType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Date || (value && typeof value === 'object' &&
        Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds))) return 'timestamp';
    if (typeof value === 'object') return 'map';
    if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
    return typeof value;
}

/**
 * Offline, read-only inventory. It never returns document IDs or field values.
 * Input: [{ collection: 'books', id: 'local-only-id', data: { ... } }]
 * Output contains field names and coarse type/count metadata only.
 */
export function auditLegacyCollectionSnapshot(records) {
    if (!Array.isArray(records)) throw new TypeError('Snapshot must be an array');

    const collections = Object.fromEntries(Object.keys(SCHEMAS).map(name => [name, {
        documents: 0,
        missingCreatedAt: 0,
        missingUpdatedAt: 0,
        missingRequiredFields: 0,
        unknownFieldDocuments: 0,
        invalidStatus: 0,
        invalidTimestampDocuments: 0,
        fields: {},
        observedStatuses: {}
    }]));
    const issues = [];
    let invalidRecords = 0;

    for (const record of records) {
        if (!record || typeof record !== 'object' || Array.isArray(record) ||
            !Object.hasOwn(SCHEMAS, record.collection) ||
            !record.data || typeof record.data !== 'object' || Array.isArray(record.data)) {
            invalidRecords++;
            issues.push({ code: 'invalid_record_shape' });
            continue;
        }

        const schema = SCHEMAS[record.collection];
        const summary = collections[record.collection];
        const data = record.data;
        summary.documents++;

        for (const [field, value] of Object.entries(data)) {
            const entry = summary.fields[field] ??= { count: 0, types: {} };
            entry.count++;
            const type = coarseType(value);
            entry.types[type] = (entry.types[type] ?? 0) + 1;
        }

        if (!Object.hasOwn(data, 'createdAt')) summary.missingCreatedAt++;
        if (!Object.hasOwn(data, 'updatedAt')) summary.missingUpdatedAt++;
        if ((Object.hasOwn(data, 'createdAt') && !isTimestamp(data.createdAt)) ||
            (Object.hasOwn(data, 'updatedAt') && !isTimestamp(data.updatedAt))) {
            summary.invalidTimestampDocuments++;
        }
        if (schema.required.some(key => !Object.hasOwn(data, key))) {
            summary.missingRequiredFields++;
        }
        if (Object.keys(data).some(key => !schema.allowed.has(key))) {
            summary.unknownFieldDocuments++;
        }
        if (Object.hasOwn(data, 'status')) {
            const status = data.status;
            const statusKey = typeof status === 'string' && status.length <= 64
                ? status
                : '[non-string-or-long]';
            summary.observedStatuses[statusKey] = (summary.observedStatuses[statusKey] ?? 0) + 1;
            if (!schema.statuses.has(status)) summary.invalidStatus++;
        }
    }

    const totals = Object.values(collections).reduce((acc, item) => {
        for (const key of Object.keys(acc)) acc[key] += item[key];
        return acc;
    }, {
        documents: 0,
        missingCreatedAt: 0,
        missingUpdatedAt: 0,
        missingRequiredFields: 0,
        unknownFieldDocuments: 0,
        invalidStatus: 0,
        invalidTimestampDocuments: 0
    });

    for (const summary of Object.values(collections)) {
        summary.fields = Object.fromEntries(Object.entries(summary.fields).sort(([a], [b]) => a.localeCompare(b)));
        summary.observedStatuses = Object.fromEntries(Object.entries(summary.observedStatuses).sort(([a], [b]) => a.localeCompare(b)));
    }

    return {
        mode: 'offline-read-only-inventory',
        migrationApplied: false,
        valuesIncluded: false,
        idsIncluded: false,
        summary: { ...totals, invalidRecords },
        collections,
        issues
    };
}
