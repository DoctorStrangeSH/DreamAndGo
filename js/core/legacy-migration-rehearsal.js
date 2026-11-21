import { normalizeLegacyDocument } from './legacy-document-normalizer.js';

/**
 * All-or-nothing in-memory rehearsal for synthetic documents.
 * Never connects to Firebase, mutates inputs, or writes any data.
 */
export function runLegacyMigrationRehearsal({ documents, manifest }) {
    if (!Array.isArray(documents)) {
        return {
            status: 'blocked',
            migrationApplied: false,
            executable: false,
            blockers: ['documents_must_be_array'],
            normalizedDocuments: [],
            rollbackPreview: []
        };
    }

    const sourceSnapshot = structuredClone(documents);
    const normalized = [];
    const failures = [];

    documents.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
            typeof entry.collection !== 'string' ||
            !entry.document || typeof entry.document !== 'object' || Array.isArray(entry.document) ||
            Object.keys(entry).some(key => !['collection', 'document'].includes(key))) {
            failures.push({ index, errors: ['invalid_rehearsal_entry'] });
            return;
        }
        const result = normalizeLegacyDocument({
            collection: entry.collection,
            document: entry.document,
            manifest
        });
        if (!result.valid) {
            failures.push({ index, collection: entry.collection, errors: result.errors });
            return;
        }
        normalized.push({ collection: entry.collection, document: result.normalized });
    });

    const success = failures.length === 0;
    return {
        mode: 'synthetic-in-memory-rehearsal',
        status: success ? 'passed' : 'blocked',
        migrationApplied: false,
        executable: false,
        sourceDocuments: documents.length,
        normalizedDocuments: success ? normalized : [],
        normalizedCount: success ? normalized.length : 0,
        failures,
        rollback: {
            verified: success,
            strategy: 'immutable-input-snapshot',
            restoredDocuments: structuredClone(sourceSnapshot)
        },
        limitations: [
            'Synthetic/in-memory rehearsal only',
            'No Firestore reads, writes, IDs or network operations',
            'Rollback verifies restoration of the immutable input snapshot, not a production backup',
            'This report never authorizes production execution'
        ]
    };
}
