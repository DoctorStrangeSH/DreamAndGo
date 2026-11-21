import test from 'node:test';
import assert from 'node:assert/strict';
import { planLegacyMigrationDryRun } from '../js/core/legacy-migration-dry-run.js';

const names = ['dreams', 'travels', 'books', 'movies', 'restaurants'];
const statusValues = {
    dreams: 'dreaming', travels: 'planned', books: 'reading',
    movies: 'to_watch', restaurants: 'want_to_visit'
};
const titleFields = {
    dreams: 'title', travels: 'title', books: 'title', movies: 'title', restaurants: 'name'
};
const manifest = () => ({
    version: 1,
    approved: true,
    sourceSchema: 'legacy-export-2026-11-21',
    targetSchema: 'firestore-v1',
    backup: { required: true, reference: 'staging-backup-reference' },
    rollback: { verified: true },
    collections: names.map(name => ({
        name,
        fields: [
            { source: titleFields[name], action: 'keep' },
            { source: 'status', action: 'keep' }
        ]
    }))
});
const inventory = () => ({
    mode: 'offline-read-only-inventory',
    migrationApplied: false,
    idsIncluded: false,
    valuesIncluded: false,
    summary: {
        invalidRecords: 0, missingCreatedAt: 0, missingUpdatedAt: 0,
        missingRequiredFields: 0, unknownFieldDocuments: 0, invalidStatus: 0,
        invalidTimestampDocuments: 0, fieldTypeMismatches: 0
    },
    collections: Object.fromEntries(names.map(name => [name, {
        documents: 3,
        fields: {
            [titleFields[name]]: { count: 3, types: { string: 3 } },
            status: { count: 3, types: { string: 3 } }
        },
        observedStatuses: { [statusValues[name]]: 3 }
    }]))
});

test('creates a non-executable aggregate-only plan for fully mapped clean inventory', () => {
    const result = planLegacyMigrationDryRun({ manifest: manifest(), inventory: inventory() });
    assert.equal(result.mode, 'offline-aggregate-dry-run');
    assert.equal(result.migrationApplied, false);
    assert.equal(result.executable, false);
    assert.equal(result.status, 'plan-only');
    assert.equal(result.totals.documents, 15);
    assert.equal(result.collections.books.fieldOperations.length, 2);
    assert.equal(result.collections.books.statusOperations[0].target, 'reading');
});

test('blocks planning when a source field is not mapped', () => {
    const source = inventory();
    source.collections.books.fields.oldExtra = { count: 1, types: { string: 1 } };
    const result = planLegacyMigrationDryRun({ manifest: manifest(), inventory: source });
    assert.equal(result.status, 'review-required');
    assert.ok(result.blockers.includes('unmapped_source_field:books:oldExtra'));
});

test('blocks target field collisions and invalid target fields', () => {
    const config = manifest();
    config.collections[0].fields.push({ source: 'oldTitle', action: 'rename', target: 'title' });
    const source = inventory();
    source.collections.dreams.fields.oldTitle = { count: 1, types: { string: 1 } };
    const result = planLegacyMigrationDryRun({ manifest: config, inventory: source });
    assert.ok(result.blockers.includes('target_field_collision:dreams:title'));
});

test('maps legacy statuses only to target collection enum values', () => {
    const config = manifest();
    config.collections[0].statusMap = { active: 'completed' };
    const source = inventory();
    source.collections.dreams.observedStatuses = { active: 2 };
    const result = planLegacyMigrationDryRun({ manifest: config, inventory: source });
    assert.equal(result.collections.dreams.statusOperations[0].target, 'completed');
    assert.equal(result.status, 'plan-only');
});

test('blocks invalid status mappings and unresolved inventory gaps', () => {
    const config = manifest();
    config.collections[0].statusMap = { active: 'completed' };
    const source = inventory();
    source.summary.invalidStatus = 2;
    source.collections.dreams.observedStatuses = { active: 2 };
    const result = planLegacyMigrationDryRun({ manifest: config, inventory: source });
    assert.equal(result.status, 'plan-only');
    assert.equal(result.collections.dreams.statusOperations[0].target, 'completed');

    const unmapped = inventory();
    unmapped.summary.invalidStatus = 2;
    unmapped.collections.dreams.observedStatuses = { active: 2 };
    const blocked = planLegacyMigrationDryRun({ manifest: manifest(), inventory: unmapped });
    assert.equal(blocked.status, 'review-required');
    assert.ok(blocked.blockers.includes('unmapped_status:dreams:active'));
});

test('rejects inventories that are not sanitized aggregate reports', () => {
    const source = inventory();
    source.idsIncluded = true;
    const result = planLegacyMigrationDryRun({ manifest: manifest(), inventory: source });
    assert.equal(result.status, 'blocked');
    assert.equal(result.executable, false);
    assert.ok(result.blockers.includes('sanitized_inventory_required'));
});


test('allows explicit drop decisions to resolve unknown legacy fields in aggregate planning', () => {
    const config = manifest();
    config.collections[0].fields.push({
        source: 'oldFlag',
        action: 'drop',
        dataLossApproval: true
    });
    const source = inventory();
    source.summary.unknownFieldDocuments = 2;
    source.collections.dreams.fields.oldFlag = { count: 2, types: { boolean: 2 } };
    const result = planLegacyMigrationDryRun({ manifest: config, inventory: source });
    assert.equal(result.status, 'plan-only');
    assert.ok(result.collections.dreams.fieldOperations.some(item =>
        item.source === 'oldFlag' && item.action === 'drop'));
});
