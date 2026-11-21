import test from 'node:test';
import assert from 'node:assert/strict';
import { runLegacyMigrationRehearsal } from '../js/core/legacy-migration-rehearsal.js';

const ts = { seconds: 1795280400, nanoseconds: 0 };
const collections = ['dreams', 'travels', 'books', 'movies', 'restaurants'];
const fixtures = {
    dreams: { title: 'Learn to draw', category: 'Творчество', status: 'dreaming', description: '', progress: 0, deadline: null, steps: [], createdAt: ts, updatedAt: ts },
    travels: { title: 'Mountain trip', type: 'mountains', status: 'planned', budget: { planned: 1000, spent: 0, currency: 'EUR' }, photos: [], createdAt: ts, updatedAt: ts },
    books: { title: 'The Hobbit', author: 'J. R. R. Tolkien', status: 'reading', genres: ['Фантастика'], year: 1937, totalPages: 310, currentPage: 10, userRating: 0, review: '', quotes: [], notes: '', createdAt: ts, updatedAt: ts },
    movies: { movieId: 11, title: 'Star Wars', status: 'to_watch', originalTitle: '', overview: '', poster: '', backdrop: '', voteAverage: 8.2, voteCount: 10, rating: 0, releaseDate: '1977-05-25', genreIds: [878], runtime: 121, tagline: '', budget: 11000000, productionCountries: [], userRating: 0, review: '', notes: '', createdAt: ts, updatedAt: ts },
    restaurants: { name: 'Sample Bistro', cuisine: 'Итальянская', status: 'want_to_visit', address: '', visitDate: null, avgBill: 0, userRating: 0, favoriteDishes: [], review: '', photos: [], notes: '', createdAt: ts, updatedAt: ts }
};
const manifest = () => ({
    version: 1,
    approved: true,
    sourceSchema: 'synthetic-legacy-fixture-v1',
    targetSchema: 'firestore-v1',
    backup: { required: true, reference: 'synthetic-backup-only' },
    rollback: { verified: true },
    collections: collections.map(collection => ({
        name: collection,
        fields: Object.keys(fixtures[collection]).map(source => ({ source, action: 'keep' }))
    }))
});

test('rehearses all five synthetic collections atomically', () => {
    const documents = collections.map(collection => ({
        collection,
        document: structuredClone(fixtures[collection])
    }));
    const result = runLegacyMigrationRehearsal({ documents, manifest: manifest() });
    assert.equal(result.status, 'passed');
    assert.equal(result.migrationApplied, false);
    assert.equal(result.executable, false);
    assert.equal(result.sourceDocuments, 5);
    assert.equal(result.normalizedCount, 5);
    assert.deepEqual(result.normalizedDocuments.map(item => item.collection), collections);
    assert.equal(result.rollbackPreview.snapshotCaptured, true);
    assert.equal(result.rollbackPreview.inputMutated, false);
    assert.equal(result.rollbackPreview.productionRestoreVerified, false);
    assert.deepEqual(result.rollbackPreview.restoredDocuments, documents);
});

test('blocks the whole batch when one document fails validation', () => {
    const documents = collections.map(collection => ({
        collection,
        document: structuredClone(fixtures[collection])
    }));
    documents[2].document.currentPage = 999999;
    const before = structuredClone(documents);
    const result = runLegacyMigrationRehearsal({ documents, manifest: manifest() });
    assert.equal(result.status, 'blocked');
    assert.equal(result.normalizedCount, 0);
    assert.deepEqual(result.normalizedDocuments, []);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].index, 2);
    assert.deepEqual(documents, before);
    assert.deepEqual(result.rollback.restoredDocuments, before);
});

test('does not mutate caller documents when normalizing successful input', () => {
    const documents = [{ collection: 'dreams', document: structuredClone(fixtures.dreams) }];
    const before = structuredClone(documents);
    const result = runLegacyMigrationRehearsal({ documents, manifest: manifest() });
    assert.equal(result.status, 'passed');
    assert.deepEqual(documents, before);
});

test('rejects malformed rehearsal entries and unsupported collection names', () => {
    const malformed = runLegacyMigrationRehearsal({
        documents: [{ collection: 'dreams', document: [], extra: true }],
        manifest: manifest()
    });
    assert.equal(malformed.status, 'blocked');
    assert.deepEqual(malformed.failures[0].errors, ['invalid_rehearsal_entry']);

    const unsupported = runLegacyMigrationRehearsal({
        documents: [{ collection: 'users', document: { title: 'x' } }],
        manifest: manifest()
    });
    assert.equal(unsupported.status, 'blocked');
    assert.ok(unsupported.failures[0].errors.includes('unknown_collection'));
});

test('rejects non-array input without attempting any transformation', () => {
    const result = runLegacyMigrationRehearsal({ documents: null, manifest: manifest() });
    assert.equal(result.status, 'blocked');
    assert.equal(result.migrationApplied, false);
    assert.deepEqual(result.blockers, ['documents_must_be_array']);
});


test('rejects empty batches rather than reporting a vacuous rehearsal pass', () => {
    const result = runLegacyMigrationRehearsal({ documents: [], manifest: manifest() });
    assert.equal(result.status, 'blocked');
    assert.deepEqual(result.blockers, ['documents_must_not_be_empty']);
});
