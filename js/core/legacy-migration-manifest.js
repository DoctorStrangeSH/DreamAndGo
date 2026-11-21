const COLLECTIONS = new Set(['dreams', 'travels', 'books', 'movies', 'restaurants']);
const FIELD_ACTIONS = new Set(['keep', 'rename', 'drop', 'default', 'manual_review']);
const MANIFEST_VERSION = 1;

/**
 * Validates a human-reviewed migration manifest.
 * This module never reads Firestore and never applies a migration.
 */
export function validateLegacyMigrationManifest(manifest) {
    const errors = [];
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        return { valid: false, ready: false, errors: ['manifest_must_be_object'] };
    }
    if (manifest.version !== MANIFEST_VERSION) errors.push('unsupported_manifest_version');
    if (manifest.approved !== true) errors.push('manifest_not_approved');
    if (manifest.sourceSchema !== 'legacy-unknown') errors.push('source_schema_must_be_explicitly_identified');
    if (manifest.targetSchema !== 'firestore-v1') errors.push('invalid_target_schema');
    if (!manifest.backup?.required || typeof manifest.backup?.reference !== 'string' ||
        manifest.backup.reference.trim().length < 3) errors.push('backup_reference_required');
    if (manifest.rollback?.verified !== true) errors.push('rollback_not_verified');
    if (!Array.isArray(manifest.collections)) {
        errors.push('collections_must_be_array');
        return { valid: false, ready: false, errors };
    }

    const seenCollections = new Set();
    for (const collection of manifest.collections) {
        if (!collection || typeof collection !== 'object' || !COLLECTIONS.has(collection.name)) {
            errors.push('unknown_collection');
            continue;
        }
        if (seenCollections.has(collection.name)) errors.push(`duplicate_collection:${collection.name}`);
        seenCollections.add(collection.name);
        if (!Array.isArray(collection.fields) || collection.fields.length === 0) {
            errors.push(`field_mappings_required:${collection.name}`);
            continue;
        }
        const seenSources = new Set();
        for (const field of collection.fields) {
            if (!field || typeof field !== 'object' ||
                typeof field.source !== 'string' || field.source.length < 1 || field.source.length > 64 ||
                !FIELD_ACTIONS.has(field.action)) {
                errors.push(`invalid_field_mapping:${collection.name}`);
                continue;
            }
            if (seenSources.has(field.source)) errors.push(`duplicate_source_field:${collection.name}:${field.source}`);
            seenSources.add(field.source);
            if (field.action === 'rename' &&
                (typeof field.target !== 'string' || field.target.length < 1 || field.target.length > 64)) {
                errors.push(`rename_target_required:${collection.name}:${field.source}`);
            }
            if (field.action === 'default' && !Object.hasOwn(field, 'value')) {
                errors.push(`default_value_required:${collection.name}:${field.source}`);
            }
            if (field.action === 'manual_review' && field.resolution !== 'documented') {
                errors.push(`manual_review_unresolved:${collection.name}:${field.source}`);
            }
            if (field.action === 'drop' && field.dataLossApproval !== true) {
                errors.push(`drop_requires_data_loss_approval:${collection.name}:${field.source}`);
            }
        }
        if (collection.statusMap !== undefined) {
            if (!collection.statusMap || typeof collection.statusMap !== 'object' || Array.isArray(collection.statusMap)) {
                errors.push(`invalid_status_map:${collection.name}`);
            } else {
                for (const [source, target] of Object.entries(collection.statusMap)) {
                    if (typeof source !== 'string' || typeof target !== 'string' || target.length > 64) {
                        errors.push(`invalid_status_mapping:${collection.name}`);
                    }
                }
            }
        }
    }

    for (const name of COLLECTIONS) {
        if (!seenCollections.has(name)) errors.push(`collection_not_covered:${name}`);
    }

    return {
        valid: errors.length === 0,
        ready: errors.length === 0 && manifest.approved === true &&
            manifest.backup?.required === true && manifest.rollback?.verified === true,
        errors
    };
}

export function assessLegacyMigrationReadiness({ manifest, inventory }) {
    const validation = validateLegacyMigrationManifest(manifest);
    if (!inventory || inventory.mode !== 'offline-read-only-inventory' ||
        inventory.migrationApplied !== false || inventory.idsIncluded !== false ||
        inventory.valuesIncluded !== false) {
        return {
            ready: false,
            status: 'blocked',
            blockers: ['sanitized_inventory_required', ...validation.errors]
        };
    }
    if (!validation.ready) {
        return { ready: false, status: 'blocked', blockers: validation.errors };
    }
    const summary = inventory.summary ?? {};
    const unresolved = [
        'invalidRecords', 'missingCreatedAt', 'missingUpdatedAt',
        'missingRequiredFields', 'unknownFieldDocuments',
        'invalidStatus', 'invalidTimestampDocuments', 'fieldTypeMismatches'
    ].filter(key => Number(summary[key] ?? 0) > 0);
    if (unresolved.length) {
        return {
            ready: false,
            status: 'review-required',
            blockers: unresolved.map(key => `inventory:${key}`)
        };
    }
    return {
        ready: false,
        status: 'approval-required',
        blockers: ['independent_staging_rehearsal_required', 'production_backup_verification_required']
    };
}
