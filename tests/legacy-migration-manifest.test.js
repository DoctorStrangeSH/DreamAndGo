import test from 'node:test';
import assert from 'node:assert/strict';
import {
    validateLegacyMigrationManifest,
    assessLegacyMigrationReadiness
} from '../js/core/legacy-migration-manifest.js';

const collections = ['dreams', 'travels', 'books', 'movies', 'restaurants'];
const primaryFields = { dreams: 'title', travels: 'title', books: 'title', movies: 'title', restaurants: 'name' };
const approvedManifest = () => ({
    version: 1,
    approved: true,
    sourceSchema: 'legacy-export-2026-11-21',
    targetSchema: 'firestore-v1',
    backup: { required: true, reference: 'staging-backup-2026-11-21' },
    rollback: { verified: true },
    collections: collections.map(name => ({
        name,
        fields: [{ source: primaryFields[name], action: 'keep' }]
    }))
});

const cleanInventory = {
    mode: 'offline-read-only-inventory',
    migrationApplied: false,
    valuesIncluded: false,
    idsIncluded: false,
    summary: {
        invalidRecords: 0,
        missingCreatedAt: 0,
        missingUpdatedAt: 0,
        missingRequiredFields: 0,
        unknownFieldDocuments: 0,
        invalidStatus: 0,
        invalidTimestampDocuments: 0,
        fieldTypeMismatches: 0
    }
};

test('rejects unapproved and incomplete manifests by default', () => {
    const result = validateLegacyMigrationManifest({
        version: 1,
        approved: false,
        sourceSchema: 'legacy-unknown',
        targetSchema: 'firestore-v1',
        collections: []
    });
    assert.equal(result.valid, false);
    assert.equal(result.ready, false);
    assert.ok(result.errors.includes('manifest_not_approved'));
    assert.ok(result.errors.includes('backup_reference_required'));
    assert.ok(result.errors.includes('rollback_not_verified'));
});

test('requires explicit coverage and field decisions for every private collection', () => {
    const manifest = approvedManifest();
    manifest.collections = manifest.collections.filter(item => item.name !== 'movies');
    const result = validateLegacyMigrationManifest(manifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('collection_not_covered:movies'));
});

test('requires explicit approval before destructive or unresolved field actions', () => {
    const manifest = approvedManifest();
    manifest.collections[0].fields = [
        { source: 'legacyField', action: 'drop' },
        { source: 'otherField', action: 'manual_review' }
    ];
    const result = validateLegacyMigrationManifest(manifest);
    assert.ok(result.errors.includes('drop_requires_data_loss_approval:dreams:legacyField'));
    assert.ok(result.errors.includes('manual_review_requires_concrete_action:dreams:otherField'));
});

test('requires rename targets and explicit defaults', () => {
    const manifest = approvedManifest();
    manifest.collections[0].fields = [
        { source: 'oldTitle', action: 'rename' },
        { source: 'status', action: 'default' }
    ];
    const result = validateLegacyMigrationManifest(manifest);
    assert.ok(result.errors.includes('rename_target_required:dreams:oldTitle'));
    assert.ok(result.errors.includes('default_value_required:dreams:status'));
});

test('does not authorize migration from inventory alone, even with a valid manifest', () => {
    const manifest = approvedManifest();
    assert.equal(validateLegacyMigrationManifest(manifest).valid, true);
    const result = assessLegacyMigrationReadiness({ manifest, inventory: cleanInventory });
    assert.equal(result.ready, false);
    assert.equal(result.status, 'approval-required');
    assert.ok(result.blockers.includes('independent_staging_rehearsal_required'));
    assert.ok(result.blockers.includes('production_backup_verification_required'));
});

test('blocks migration readiness when the sanitized inventory has unresolved schema gaps', () => {
    const inventory = structuredClone(cleanInventory);
    inventory.summary.fieldTypeMismatches = 2;
    const result = assessLegacyMigrationReadiness({ manifest: approvedManifest(), inventory });
    assert.equal(result.ready, false);
    assert.equal(result.status, 'review-required');
    assert.ok(result.blockers.includes('inventory:fieldTypeMismatches'));
});

test('rejects inventories that include IDs or raw values', () => {
    const inventory = { ...cleanInventory, idsIncluded: true };
    const result = assessLegacyMigrationReadiness({ manifest: approvedManifest(), inventory });
    assert.equal(result.ready, false);
    assert.equal(result.status, 'blocked');
    assert.ok(result.blockers.includes('sanitized_inventory_required'));
});


test('rejects unknown source schema identifiers and invalid V1 status targets', () => {
    const unknown = approvedManifest();
    unknown.sourceSchema = 'legacy-unknown';
    assert.ok(validateLegacyMigrationManifest(unknown).errors.includes('source_schema_must_be_explicitly_identified'));

    const invalidStatus = approvedManifest();
    invalidStatus.collections[0].statusMap = { active: 'public' };
    assert.ok(validateLegacyMigrationManifest(invalidStatus).errors.includes('invalid_status_mapping:dreams'));
});


test('rejects keep/rename/default mappings that do not target the V1 allowlist', () => {
    const unknownKeep = approvedManifest();
    unknownKeep.collections[0].fields = [{ source: 'oldField', action: 'keep' }];
    assert.ok(validateLegacyMigrationManifest(unknownKeep).errors.includes('unknown_keep_target:dreams:oldField'));

    const unknownRename = approvedManifest();
    unknownRename.collections[0].fields = [{ source: 'oldTitle', action: 'rename', target: 'isPublic' }];
    assert.ok(validateLegacyMigrationManifest(unknownRename).errors.includes('unknown_rename_target:dreams:oldTitle'));

    const invalidDefault = approvedManifest();
    invalidDefault.collections[0].fields = [{ source: 'legacyCategory', action: 'default', value: '', target: 'isPublic' }];
    assert.ok(validateLegacyMigrationManifest(invalidDefault).errors.includes('default_target_required:dreams:legacyCategory'));
});

test('keeps manual-review mappings blocked until replaced by a concrete action', () => {
    const manifest = approvedManifest();
    manifest.collections[0].fields = [{ source: 'legacyField', action: 'manual_review', resolution: 'documented' }];
    assert.ok(validateLegacyMigrationManifest(manifest).errors.includes('manual_review_requires_concrete_action:dreams:legacyField'));
});
