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

function isTimestamp(value) {
    return value instanceof Date ||
        (value && typeof value === 'object' &&
         Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds) &&
         value.seconds >= 0 && value.nanoseconds >= 0 && value.nanoseconds < 1_000_000_000);
}

/**
 * Offline, read-only inventory. It deliberately never returns document IDs or
 * field values, and it does not guess mappings for unknown historical fields.
 * Input: [{ collection: 'books', id: '...', data: { ... } }]
 */
export function auditLegacyCollectionSnapshot(records) {
    if (!Array.isArray(records)) throw new TypeError('Snapshot must be an array');
    const collections = Object.fromEntries(Object.keys(SCHEMAS).map(name => [name, {
        documents: 0, missingCreatedAt: 0, missingUpdatedAt: 0,
        missingRequiredFields: 0, unknownFieldDocuments: 0,
        invalidStatus: 0, invalidTimestampDocuments: 0
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

        if (!Object.hasOwn(data, 'createdAt')) summary.missingCreatedAt++;
        if (!Object.hasOwn(data, 'updatedAt')) summary.missingUpdatedAt++;
        if (Object.hasOwn(data, 'createdAt') && !isTimestamp(data.createdAt) ||
            Object.hasOwn(data, 'updatedAt') && !isTimestamp(data.updatedAt)) {
            summary.invalidTimestampDocuments++;
        }

        if (schema.required.some(key => !Object.hasOwn(data, key))) {
            summary.missingRequiredFields++;
        }
        if (Object.keys(data).some(key => !schema.allowed.has(key))) {
            summary.unknownFieldDocuments++;
        }
        if (Object.hasOwn(data, 'status') && !schema.statuses.has(data.status)) {
            summary.invalidStatus++;
        }
    }

    const totals = Object.values(collections).reduce((acc, item) => {
        for (const key of Object.keys(acc)) acc[key] += item[key];
        return acc;
    }, {
        documents: 0, missingCreatedAt: 0, missingUpdatedAt: 0,
        missingRequiredFields: 0, unknownFieldDocuments: 0,
        invalidStatus: 0, invalidTimestampDocuments: 0
    });

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
