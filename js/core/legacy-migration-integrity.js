const COLLECTIONS = ['dreams', 'travels', 'books', 'movies', 'restaurants'];

function sameValue(left, right) {
    if (Object.is(left, right)) return true;
    if (left instanceof Date || right instanceof Date) {
        return left instanceof Date && right instanceof Date &&
            !Number.isNaN(left.valueOf()) && left.valueOf() === right.valueOf();
    }
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length ||
        leftKeys.some((key, index) => key !== rightKeys[index])) return false;
    return leftKeys.every(key => sameValue(left[key], right[key]));
}

/**
 * Independently checks count parity and explicit field decisions.
 * Does not write data, infer undocumented fields, or claim database durability.
 */
export function auditLegacyMigrationIntegrity({ sourceDocuments, normalizedDocuments, manifest }) {
    const blockers = [];
    if (!Array.isArray(sourceDocuments) || sourceDocuments.length === 0 ||
        !Array.isArray(normalizedDocuments) || !manifest ||
        !Array.isArray(manifest.collections)) {
        return {
            status: 'blocked',
            passed: false,
            blockers: ['valid_non_empty_source_output_and_manifest_required'],
            counts: { source: 0, normalized: 0 },
            collections: {}
        };
    }

    if (sourceDocuments.length !== normalizedDocuments.length) {
        blockers.push('document_count_mismatch');
    }
    const configs = new Map(manifest.collections.map(item => [item.name, item]));
    const collectionReports = Object.fromEntries(COLLECTIONS.map(name => [name, {
        sourceDocuments: 0,
        normalizedDocuments: 0,
        preservedFields: 0,
        renamedFields: 0,
        defaultedFields: 0,
        droppedFields: 0,
        statusMappings: 0,
        failures: []
    }]));

    const length = Math.min(sourceDocuments.length, normalizedDocuments.length);
    for (let index = 0; index < length; index++) {
        const sourceEntry = sourceDocuments[index];
        const outputEntry = normalizedDocuments[index];
        if (!sourceEntry || !outputEntry ||
            sourceEntry.collection !== outputEntry.collection ||
            !collectionReports[sourceEntry.collection]) {
            blockers.push(`document_identity_mismatch:${index}`);
            continue;
        }
        const collection = sourceEntry.collection;
        const report = collectionReports[collection];
        report.sourceDocuments++;
        report.normalizedDocuments++;
        const config = configs.get(collection);
        if (!config || !sourceEntry.document || !outputEntry.document ||
            typeof sourceEntry.document !== 'object' || typeof outputEntry.document !== 'object') {
            report.failures.push(`invalid_document_pair:${index}`);
            continue;
        }
        const mappings = new Map(config.fields.map(field => [field.source, field]));
        const expectedTargets = new Set();

        for (const [field, value] of Object.entries(sourceEntry.document)) {
            const mapping = mappings.get(field);
            if (!mapping) {
                report.failures.push(`unmapped_source_field:${index}:${field}`);
                continue;
            }
            if (mapping.action === 'drop') {
                report.droppedFields++;
                continue;
            }
            if (mapping.action === 'default' || mapping.action === 'manual_review') {
                continue;
            }
            const target = mapping.action === 'rename' ? mapping.target : field;
            expectedTargets.add(target);
            if (!Object.hasOwn(outputEntry.document, target) ||
                !sameValue(value, outputEntry.document[target])) {
                report.failures.push(`preserved_value_mismatch:${index}:${field}`);
                continue;
            }
            if (mapping.action === 'rename') report.renamedFields++;
            else report.preservedFields++;
        }

        for (const mapping of config.fields) {
            if (mapping.action === 'default') {
                const target = mapping.target;
                expectedTargets.add(target);
                if (!Object.hasOwn(outputEntry.document, target) ||
                    !sameValue(mapping.value, outputEntry.document[target])) {
                    report.failures.push(`default_value_mismatch:${index}:${target}`);
                } else {
                    report.defaultedFields++;
                }
            }
        }

        if (Object.hasOwn(sourceEntry.document, 'status')) {
            const original = sourceEntry.document.status;
            const expected = config.statusMap?.[original] ?? original;
            if (!Object.hasOwn(outputEntry.document, 'status') ||
                !sameValue(expected, outputEntry.document.status)) {
                report.failures.push(`status_mapping_mismatch:${index}`);
            } else if (expected !== original) {
                report.statusMappings++;
            }
        }
    }

    for (const name of COLLECTIONS) {
        const report = collectionReports[name];
        if (report.failures.length) blockers.push(...report.failures.map(item => `${name}:${item}`));
    }
    const passed = blockers.length === 0 &&
        sourceDocuments.length === normalizedDocuments.length &&
        COLLECTIONS.every(name => collectionReports[name].sourceDocuments === collectionReports[name].normalizedDocuments);

    return {
        mode: 'offline-migration-integrity-audit',
        status: passed ? 'passed' : 'blocked',
        passed,
        databaseWritePerformed: false,
        counts: {
            source: sourceDocuments.length,
            normalized: normalizedDocuments.length,
            difference: normalizedDocuments.length - sourceDocuments.length
        },
        collections: collectionReports,
        blockers: [...new Set(blockers)].sort(),
        limitations: [
            'Compares only the supplied in-memory source and normalized documents',
            'Does not verify Firestore persistence, document IDs or database-level uniqueness',
            'Approved drops are counted as intentional and are not treated as data loss',
            'No database connection or write operation is performed'
        ]
    };
}
