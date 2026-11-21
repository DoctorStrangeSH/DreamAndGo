import test from 'node:test';
import assert from 'node:assert/strict';
import { auditLegacyCollectionSnapshot } from '../js/core/legacy-collection-audit.js';

const timestamp = { seconds: 1_700_000_000, nanoseconds: 0 };

test('reports missing timestamps, old statuses and unknown fields without exposing values or ids', () => {
    const report = auditLegacyCollectionSnapshot([
        { collection: 'dreams', id: 'private-doc-id', data: { title: 'private title', status: 'active', isPublic: true } },
        { collection: 'travels', id: 'private-doc-id-2', data: { title: 'trip', type: 'city', status: 'visited', createdAt: timestamp, updatedAt: timestamp } },
        { collection: 'books', data: { title: 'book', author: 'author', status: 'read', createdAt: new Date(), updatedAt: new Date() } },
        { collection: 'movies', data: { movieId: 1, title: 'movie', status: 'watched', createdAt: timestamp, updatedAt: timestamp } },
        { collection: 'restaurants', data: { name: 'place', cuisine: '', status: 'visited', createdAt: timestamp, updatedAt: timestamp } }
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
    assert.equal(report.collections.dreams.fields.isPublic.count, 1);
    assert.equal(report.collections.dreams.fields.isPublic.types.boolean, 1);
    assert.equal(report.collections.dreams.observedStatuses.active, 1);
    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes('private-doc-id'), false);
    assert.equal(serialized.includes('private title'), false);
    assert.equal(serialized.includes('"active"'), true);
});

test('counts missing required fields and malformed timestamps', () => {
    const report = auditLegacyCollectionSnapshot([
        { collection: 'books', data: { title: 'book', createdAt: 'not-a-timestamp', updatedAt: null } }
    ]);
    assert.equal(report.summary.missingRequiredFields, 1);
    assert.equal(report.summary.invalidTimestampDocuments, 1);
});

test('rejects invalid snapshot shape and counts malformed records without throwing', () => {
    assert.throws(() => auditLegacyCollectionSnapshot(null), TypeError);
    const report = auditLegacyCollectionSnapshot([null, { collection: 'unknown', data: {} }]);
    assert.equal(report.summary.invalidRecords, 2);
    assert.deepEqual(report.issues, [{ code: 'invalid_record_shape' }, { code: 'invalid_record_shape' }]);
});


test('accepts valid pre-epoch Firestore timestamps and reports coarse field types', () => {
    const report = auditLegacyCollectionSnapshot([
        {
            collection: 'books',
            data: {
                title: 'book',
                author: 'author',
                status: 'read',
                createdAt: { seconds: -1, nanoseconds: 0 },
                updatedAt: { seconds: 0, nanoseconds: 0 },
                pages: 200
            }
        }
    ]);
    assert.equal(report.summary.invalidTimestampDocuments, 0);
    assert.equal(report.collections.books.fields.pages.types.integer, 1);
    assert.equal(report.collections.books.fields.status.types.string, 1);
});
