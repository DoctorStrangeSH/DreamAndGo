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

const FIELD_TYPES = new Set(['string', 'boolean', 'integer', 'number', 'null', 'array', 'map', 'timestamp', 'unknown']);

/**
 * Offline, read-only inventory. Input contains metadata only:
 * { collection, fields: { fieldName: 'string'|'timestamp'|... }, status?: 'old_status' }
 * No document IDs or actual user field values are accepted.
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
            !record.fields || typeof record.fields !== 'object' || Array.isArray(record.fields) ||
            Object.keys(record).some(key => !['collection', 'fields', 'status'].includes(key)) ||
            Object.values(record.fields).some(type => !FIELD_TYPES.has(type)) ||
            (Object.hasOwn(record, 'status') && (typeof record.status !== 'string' || record.status.length > 64))) {
            invalidRecords++;
            issues.push({ code: 'invalid_record_shape' });
            continue;
        }

        const schema = SCHEMAS[record.collection];
        const summary = collections[record.collection];
        const fields = record.fields;
        summary.documents++;

        for (const [field, type] of Object.entries(fields)) {
            const entry = summary.fields[field] ??= { count: 0, types: {} };
            entry.count++;
            entry.types[type] = (entry.types[type] ?? 0) + 1;
        }

        if (!Object.hasOwn(fields, 'createdAt')) summary.missingCreatedAt++;
        if (!Object.hasOwn(fields, 'updatedAt')) summary.missingUpdatedAt++;
        if ((Object.hasOwn(fields, 'createdAt') && fields.createdAt !== 'timestamp') ||
            (Object.hasOwn(fields, 'updatedAt') && fields.updatedAt !== 'timestamp')) {
            summary.invalidTimestampDocuments++;
        }
        if (schema.required.some(key => !Object.hasOwn(fields, key))) {
            summary.missingRequiredFields++;
        }
        if (Object.keys(fields).some(key => !schema.allowed.has(key))) {
            summary.unknownFieldDocuments++;
        }
        if (Object.hasOwn(record, 'status')) {
            summary.observedStatuses[record.status] = (summary.observedStatuses[record.status] ?? 0) + 1;
            if (!schema.statuses.has(record.status)) summary.invalidStatus++;
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
