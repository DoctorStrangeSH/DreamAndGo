import { validateLegacyMigrationManifest } from './legacy-migration-manifest.js';

const TARGET_FIELDS = Object.freeze({
    dreams: new Set(['title', 'category', 'status', 'description', 'progress', 'deadline', 'steps', 'createdAt', 'updatedAt']),
    travels: new Set(['title', 'type', 'status', 'location', 'description', 'budget', 'rating', 'notes', 'photos', 'createdAt', 'updatedAt']),
    books: new Set(['title', 'author', 'status', 'genres', 'year', 'totalPages', 'currentPage', 'userRating', 'review', 'quotes', 'notes', 'createdAt', 'updatedAt']),
    movies: new Set(['movieId', 'title', 'originalTitle', 'overview', 'poster', 'backdrop', 'voteAverage', 'voteCount', 'rating', 'releaseDate', 'genreIds', 'runtime', 'tagline', 'budget', 'productionCountries', 'status', 'userRating', 'review', 'notes', 'createdAt', 'updatedAt']),
    restaurants: new Set(['name', 'cuisine', 'status', 'address', 'visitDate', 'avgBill', 'userRating', 'favoriteDishes', 'review', 'photos', 'notes', 'createdAt', 'updatedAt'])
});

function safeInventory(inventory) {
    return inventory &&
        inventory.mode === 'offline-read-only-inventory' &&
        inventory.migrationApplied === false &&
        inventory.idsIncluded === false &&
        inventory.valuesIncluded === false &&
        inventory.collections && typeof inventory.collections === 'object' &&
        inventory.summary && typeof inventory.summary === 'object';
}

/**
 * Plans only aggregate field/status operations from the sanitized inventory.
 * No document values, IDs, Firestore SDK, network calls or writes are used.
 * It is not a document-level validation and never authorizes execution.
 */
export function planLegacyMigrationDryRun({ manifest, inventory }) {
    const blockers = [];
    const validation = validateLegacyMigrationManifest(manifest);
    if (!validation.valid || !validation.ready) {
        return {
            mode: 'offline-aggregate-dry-run',
            migrationApplied: false,
            executable: false,
            status: 'blocked',
            blockers: validation.errors,
            collections: {}
        };
    }
    if (!safeInventory(inventory)) {
        return {
            mode: 'offline-aggregate-dry-run',
            migrationApplied: false,
            executable: false,
            status: 'blocked',
            blockers: [...blockers, 'sanitized_inventory_required'],
            collections: {}
        };
    }

    const summary = inventory.summary;
    // Unknown fields and legacy statuses may be resolved by explicit manifest
    // mappings. Other structural gaps cannot be safely inferred from aggregate
    // metadata and remain hard blockers.
    const inventoryProblems = [
        'invalidRecords', 'missingCreatedAt', 'missingUpdatedAt',
        'missingRequiredFields', 'invalidTimestampDocuments', 'fieldTypeMismatches'
    ].filter(key => Number(summary[key] ?? 0) > 0);
    blockers.push(...inventoryProblems.map(key => `inventory:${key}`));

    const planned = {};
    for (const config of manifest.collections ?? []) {
        const observed = inventory.collections[config.name];
        if (!observed || !observed.fields || typeof observed.fields !== 'object') {
            blockers.push(`inventory_collection_missing:${config.name}`);
            continue;
        }
        const mappings = new Map(config.fields.map(field => [field.source, field]));
        const targetOwners = new Map();
        const fieldOperations = [];
        for (const [source, stats] of Object.entries(observed.fields)) {
            const mapping = mappings.get(source);
            if (!mapping) {
                blockers.push(`unmapped_source_field:${config.name}:${source}`);
                continue;
            }
            const target = mapping.action === 'keep' ? source :
                mapping.action === 'rename' ? mapping.target :
                mapping.action === 'default' ? (mapping.target ?? source) : null;
            if (target && !TARGET_FIELDS[config.name].has(target)) {
                blockers.push(`unknown_target_field:${config.name}:${target}`);
            }
            if (target) {
                if (targetOwners.has(target)) blockers.push(`target_field_collision:${config.name}:${target}`);
                targetOwners.set(target, source);
            }
            fieldOperations.push({
                source,
                action: mapping.action,
                target,
                documents: Number(stats?.count ?? 0)
            });
        }
        for (const mapping of config.fields) {
            if (mapping.action === 'default') {
                fieldOperations.push({ source: null, action: 'default', target: mapping.target ?? mapping.source, documents: Number(observed.documents ?? 0) });
            }
        }

        const statusOperations = [];
        const statusMap = config.statusMap ?? {};
        for (const [source, count] of Object.entries(observed.observedStatuses ?? {})) {
            const target = statusMap[source] ?? source;
            if (!TARGET_FIELDS[config.name].has('status')) {
                blockers.push(`status_not_supported:${config.name}`);
            }
            const allowedStatuses = {
                dreams: ['dreaming', 'in_progress', 'completed'],
                travels: ['planned', 'visited'],
                books: ['want_to_read', 'reading', 'read'],
                movies: ['to_watch', 'watched'],
                restaurants: ['want_to_visit', 'visited']
            }[config.name];
            if (!allowedStatuses.includes(target)) blockers.push(`unmapped_status:${config.name}:${source}`);
            statusOperations.push({ source, target, documents: Number(count) });
        }

        planned[config.name] = {
            documents: Number(observed.documents ?? 0),
            fieldOperations,
            statusOperations
        };
    }

    const hasBlockers = blockers.length > 0;
    return {
        mode: 'offline-aggregate-dry-run',
        migrationApplied: false,
        executable: false,
        status: hasBlockers ? 'review-required' : 'plan-only',
        blockers: [...new Set(blockers)].sort(),
        totals: {
            documents: Object.values(planned).reduce((sum, item) => sum + item.documents, 0),
            fieldOperations: Object.values(planned).reduce((sum, item) => sum + item.fieldOperations.length, 0),
            statusOperations: Object.values(planned).reduce((sum, item) => sum + item.statusOperations.length, 0)
        },
        collections: planned,
        limitations: [
            'Aggregate metadata only; no per-document values or IDs were inspected',
            'No document-level validation or transformation was performed',
            'No Firestore connection or write operation exists',
            'This report never authorizes production execution'
        ]
    };
}
