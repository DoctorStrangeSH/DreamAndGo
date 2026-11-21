import test from 'node:test';
import assert from 'node:assert/strict';
import { auditLegacyMigrationIntegrity } from '../js/core/legacy-migration-integrity.js';

const source = [{
    collection: 'books',
    document: {
        oldTitle: 'The Hobbit',
        author: 'J. R. R. Tolkien',
        status: 'finished',
        createdAt: { seconds: 100, nanoseconds: 0 },
        updatedAt: { seconds: 200, nanoseconds: 0 },
        obsoleteFlag: true,
        notes: 'legacy note'
    }
}];
const manifest = {
    collections: [{
        name: 'books',
        fields: [
            { source: 'oldTitle', action: 'rename', target: 'title' },
            { source: 'author', action: 'keep' },
            { source: 'status', action: 'keep' },
            { source: 'createdAt', action: 'keep' },
            { source: 'updatedAt', action: 'keep' },
            { source: 'obsoleteFlag', action: 'drop', dataLossApproval: true },
            { source: 'notes', action: 'default', target: 'notes', value: '' }
        ],
        statusMap: { finished: 'read' }
    }]
};
const normalized = [{
    collection: 'books',
    document: {
        title: 'The Hobbit',
        author: 'J. R. R. Tolkien',
        status: 'read',
        createdAt: { seconds: 100, nanoseconds: 0 },
        updatedAt: { seconds: 200, nanoseconds: 0 },
        notes: ''
    }
}];

test('passes when document counts and every explicit field decision are preserved', () => {
    const report = auditLegacyMigrationIntegrity({
        sourceDocuments: source,
        normalizedDocuments: normalized,
        manifest
    });
    assert.equal(report.status, 'passed');
    assert.equal(report.passed, true);
    assert.equal(report.databaseWritePerformed, false);
    assert.equal(report.counts.source, 1);
    assert.equal(report.counts.normalized, 1);
    assert.equal(report.collections.books.renamedFields, 1);
    assert.equal(report.collections.books.preservedFields, 4);
    assert.equal(report.collections.books.defaultedFields, 1);
    assert.equal(report.collections.books.droppedFields, 1);
    assert.equal(report.collections.books.statusMappings, 1);
});

test('detects a lost or changed retained field value', () => {
    const changed = structuredClone(normalized);
    changed[0].document.author = 'Someone else';
    const report = auditLegacyMigrationIntegrity({
        sourceDocuments: source,
        normalizedDocuments: changed,
        manifest
    });
    assert.equal(report.status, 'blocked');
    assert.ok(report.blockers.some(item => item.includes('preserved_value_mismatch:0:author')));
});

test('detects an incorrect default and status mapping', () => {
    const changed = structuredClone(normalized);
    changed[0].document.notes = 'not the approved default';
    changed[0].document.status = 'finished';
    const report = auditLegacyMigrationIntegrity({
        sourceDocuments: source,
        normalizedDocuments: changed,
        manifest
    });
    assert.equal(report.status, 'blocked');
    assert.ok(report.blockers.some(item => item.includes('default_value_mismatch:0:notes')));
    assert.ok(report.blockers.some(item => item.includes('status_mapping_mismatch:0')));
});

test('detects document count mismatch and collection identity mismatch', () => {
    const countMismatch = auditLegacyMigrationIntegrity({
        sourceDocuments: source,
        normalizedDocuments: [],
        manifest
    });
    assert.equal(countMismatch.status, 'blocked');
    assert.ok(countMismatch.blockers.includes('document_count_mismatch'));

    const identityMismatch = auditLegacyMigrationIntegrity({
        sourceDocuments: source,
        normalizedDocuments: [{ collection: 'dreams', document: {} }],
        manifest
    });
    assert.equal(identityMismatch.status, 'blocked');
    assert.ok(identityMismatch.blockers.includes('document_identity_mismatch:0'));
});

test('rejects empty or malformed audit inputs', () => {
    const report = auditLegacyMigrationIntegrity({
        sourceDocuments: [],
        normalizedDocuments: [],
        manifest
    });
    assert.equal(report.status, 'blocked');
    assert.ok(report.blockers.includes('valid_non_empty_source_output_and_manifest_required'));
});

test('compares nested arrays, objects and timestamps without mutating inputs', () => {
    const input = [{
        collection: 'dreams',
        document: {
            title: 'Learn to draw',
            createdAt: new Date('2026-11-21T00:00:00Z'),
            updatedAt: new Date('2026-11-21T00:00:00Z'),
            steps: [{ text: 'Practice', done: false }]
        }
    }];
    const output = structuredClone(input);
    const beforeInput = structuredClone(input);
    const dreamManifest = {
        collections: [{
            name: 'dreams',
            fields: Object.keys(input[0].document).map(field => ({ source: field, action: 'keep' }))
        }]
    };
    const report = auditLegacyMigrationIntegrity({
        sourceDocuments: input,
        normalizedDocuments: output,
        manifest: dreamManifest
    });
    assert.equal(report.status, 'passed');
    assert.deepEqual(input, beforeInput);
});
