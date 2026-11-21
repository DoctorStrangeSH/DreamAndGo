import test from 'node:test';
import assert from 'node:assert/strict';
import { auditLegacyCollectionSnapshot } from '../js/core/legacy-collection-audit.js';

test('reports metadata-only legacy gaps without accepting personal values or ids', () => {
    const report = auditLegacyCollectionSnapshot([
        { collection: 'dreams', fields: { title: 'string', status: 'string', isPublic: 'boolean' }, status: 'active' },
        { collection: 'travels', fields: { title: 'string', type: 'string', status: 'string', createdAt: 'timestamp', updatedAt: 'timestamp' }, status: 'visited' },
        { collection: 'books', fields: { title: 'string', author: 'string', status: 'string', createdAt: 'timestamp', updatedAt: 'timestamp' }, status: 'read' },
        { collection: 'movies', fields: { movieId: 'integer', title: 'string', status: 'string', createdAt: 'timestamp', updatedAt: 'timestamp' }, status: 'watched' },
        { collection: 'restaurants', fields: { name: 'string', cuisine: 'string', status: 'string', createdAt: 'timestamp', updatedAt: 'timestamp' }, status: 'visited' }
    ]);

    assert.equal(report.mode, 'offline-read-only-inventory');
    assert.equal(report.migrationApplied, false);
    assert.equal(report.valuesIncluded, false);
    assert.equal(report.idsIncluded, false);
    assert.equal(report.summary.documents, 5);
    assert.equal(report.summary.missingCreatedAt, 1);
    assert.equal(report.summary.missingUpdatedAt, 1);
    assert.equal(report.summary.invalidStatus, 1);
    assert.equal(report.summary.unknownFieldDocuments, 1);
    assert.equal(report.collections.dreams.fields.isPublic.types.boolean, 1);
    assert.equal(report.collections.dreams.observedStatuses.active, 1);
    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes('private-doc-id'), false);
    assert.equal(serialized.includes('private title'), false);
});

test('counts missing required fields and wrong timestamp metadata types', () => {
    const report = auditLegacyCollectionSnapshot([
        { collection: 'books', fields: { title: 'string', createdAt: 'string', updatedAt: 'null' } }
    ]);
    assert.equal(report.summary.missingRequiredFields, 1);
    assert.equal(report.summary.invalidTimestampDocuments, 1);
});

test('rejects raw values and invalid metadata records', () => {
    assert.throws(() => auditLegacyCollectionSnapshot(null), TypeError);
    const report = auditLegacyCollectionSnapshot([
        null,
        { collection: 'unknown', fields: {} },
        { collection: 'books', id: 'should-not-be-accepted', fields: { title: 'string' } },
        { collection: 'books', fields: { title: 'personal title' } },
        { collection: 'books', fields: { title: 'string' }, status: { raw: 'value' } }
    ]);
    assert.equal(report.summary.invalidRecords, 5);
    assert.equal(JSON.stringify(report).includes('should-not-be-accepted'), false);
});

test('accepts valid timestamp type metadata and reports coarse field types', () => {
    const report = auditLegacyCollectionSnapshot([
        {
            collection: 'books',
            fields: {
                title: 'string',
                author: 'string',
                status: 'string',
                createdAt: 'timestamp',
                updatedAt: 'timestamp',
                pages: 'integer'
            },
            status: 'read'
        }
    ]);
    assert.equal(report.summary.invalidTimestampDocuments, 0);
    assert.equal(report.collections.books.fields.pages.types.integer, 1);
    assert.equal(report.collections.books.fields.status.types.string, 1);
});


test('detects field type mismatches against the V1 collection contract', () => {
    const report = auditLegacyCollectionSnapshot([
        {
            collection: 'books',
            fields: {
                title: 'integer',
                author: 'string',
                status: 'string',
                createdAt: 'timestamp',
                updatedAt: 'timestamp'
            },
            status: 'read'
        },
        {
            collection: 'dreams',
            fields: {
                title: 'string',
                progress: 'string',
                status: 'string',
                createdAt: 'timestamp',
                updatedAt: 'timestamp'
            },
            status: 'dreaming'
        }
    ]);
    assert.equal(report.summary.fieldTypeMismatches, 2);
});


test('requires categorical status metadata whenever a status field exists', () => {
    const report = auditLegacyCollectionSnapshot([
        { collection: 'books', fields: { title: 'string', author: 'string', status: 'string' } },
        { collection: 'dreams', fields: { title: 'string', 'unexpected field': 'string' }, status: 'dreaming' }
    ]);
    assert.equal(report.summary.invalidRecords, 2);
});
