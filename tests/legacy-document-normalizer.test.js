import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLegacyDocument } from '../js/core/legacy-document-normalizer.js';

const ts = { seconds: 1795280400, nanoseconds: 0 };
const collections = ['dreams', 'travels', 'books', 'movies', 'restaurants'];
const baseManifest = () => ({
    collections: collections.map(name => ({
        name,
        fields: []
    }))
});
const mapFor = (manifest, collection, fields) => {
    manifest.collections.find(item => item.name === collection).fields = fields;
    return manifest;
};

test('normalizes a legacy book document with rename, drop, defaults and status mapping', () => {
    const manifest = baseManifest();
    mapFor(manifest, 'books', [
        { source: 'bookTitle', action: 'rename', target: 'title' },
        { source: 'author', action: 'keep' },
        { source: 'status', action: 'keep' },
        { source: 'legacyPrivateFlag', action: 'drop', dataLossApproval: true },
        { source: 'notes', action: 'default', value: '' }
    ]);
    manifest.collections.find(item => item.name === 'books').statusMap = { finished: 'read' };
    const source = {
        bookTitle: 'The Hobbit',
        author: 'J. R. R. Tolkien',
        status: 'finished',
        legacyPrivateFlag: true,
        createdAt: ts,
        updatedAt: ts
    };
    const result = normalizeLegacyDocument({ collection: 'books', document: source, manifest });
    assert.equal(result.valid, true);
    assert.deepEqual(result.normalized, {
        title: 'The Hobbit', author: 'J. R. R. Tolkien', status: 'read',
        notes: '', createdAt: ts, updatedAt: ts
    });
    assert.equal(Object.hasOwn(source, 'bookTitle'), true);
    assert.equal(Object.hasOwn(result.normalized, 'legacyPrivateFlag'), false);
    assert.equal(result.metadata.normalizedValuesReturned, true);
    assert.equal(result.metadata.documentIdIncluded, false);
});

test('validates all five target collection contracts with synthetic documents', () => {
    const fixtures = {
        dreams: {
            title: 'Learn to draw', category: 'Творчество', status: 'dreaming',
            description: '', progress: 0, deadline: null, steps: [], createdAt: ts, updatedAt: ts
        },
        travels: {
            title: 'Mountain trip', type: 'mountains', status: 'planned',
            budget: { planned: 1000, spent: 0, currency: 'EUR' }, photos: [],
            createdAt: ts, updatedAt: ts
        },
        books: {
            title: 'The Hobbit', author: 'J. R. R. Tolkien', status: 'reading',
            genres: ['Фантастика'], year: 1937, totalPages: 310, currentPage: 10,
            userRating: 0, review: '', quotes: [], notes: '', createdAt: ts, updatedAt: ts
        },
        movies: {
            movieId: 11, title: 'Star Wars', status: 'to_watch', originalTitle: '',
            overview: '', poster: '', backdrop: '', voteAverage: 8.2, voteCount: 10,
            rating: 0, releaseDate: '1977-05-25', genreIds: [878], runtime: 121,
            tagline: '', budget: 11000000, productionCountries: [],
            userRating: 0, review: '', notes: '', createdAt: ts, updatedAt: ts
        },
        restaurants: {
            name: 'Sample Bistro', cuisine: 'Итальянская', status: 'want_to_visit',
            address: '', visitDate: null, avgBill: 0, userRating: 0,
            favoriteDishes: [], review: '', photos: [], notes: '',
            createdAt: ts, updatedAt: ts
        }
    };
    for (const collection of collections) {
        const manifest = baseManifest();
        mapFor(manifest, collection, Object.keys(fixtures[collection]).map(source => ({
            source, action: 'keep'
        })));
        const result = normalizeLegacyDocument({
            collection, document: fixtures[collection], manifest
        });
        assert.equal(result.valid, true, collection + ': ' + result.errors.join(','));
        assert.deepEqual(result.normalized, fixtures[collection]);
    }
});

test('rejects missing mappings, invalid target fields and unresolved manual review', () => {
    const manifest = baseManifest();
    mapFor(manifest, 'dreams', [
        { source: 'title', action: 'keep' },
        { source: 'oldStatus', action: 'manual_review', resolution: 'documented' },
        { source: 'createdAt', action: 'keep' },
        { source: 'updatedAt', action: 'keep' }
    ]);
    const result = normalizeLegacyDocument({
        collection: 'dreams',
        document: { title: 'A dream', oldStatus: 'old', createdAt: ts, updatedAt: ts },
        manifest
    });
    assert.equal(result.valid, false);
    assert.equal(result.normalized, null);
    assert.ok(result.errors.includes('manual_review_required:oldStatus'));
    assert.ok(result.errors.includes('required_field_missing:status'));
});

test('rejects invalid dates, out-of-range values, unknown fields and malformed nested maps', () => {
    const manifest = baseManifest();
    const fields = [
        'title','category','status','description','progress','deadline','steps','createdAt','updatedAt','isPublic'
    ].map(source => ({ source, action: 'keep' }));
    mapFor(manifest, 'dreams', fields);
    const result = normalizeLegacyDocument({
        collection: 'dreams',
        document: {
            title: 'A dream', category: '', status: 'dreaming', description: '',
            progress: 150, deadline: '2026-02-30', steps: [{ text: 'x', done: 'yes' }],
            createdAt: ts, updatedAt: ts, isPublic: true
        },
        manifest
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('invalid_field:progress'));
    assert.ok(result.errors.includes('invalid_field:deadline'));
    assert.ok(result.errors.includes('invalid_field:steps'));
    assert.ok(result.errors.includes('unknown_target_field:isPublic'));
});

test('rejects target collisions and does not mutate the source document', () => {
    const manifest = baseManifest();
    mapFor(manifest, 'dreams', [
        { source: 'title', action: 'keep' },
        { source: 'oldTitle', action: 'rename', target: 'title' },
        { source: 'status', action: 'keep' },
        { source: 'createdAt', action: 'keep' },
        { source: 'updatedAt', action: 'keep' }
    ]);
    const source = {
        title: 'New', oldTitle: 'Old', status: 'dreaming', createdAt: ts, updatedAt: ts
    };
    const before = structuredClone(source);
    const result = normalizeLegacyDocument({ collection: 'dreams', document: source, manifest });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('target_field_collision:title'));
    assert.deepEqual(source, before);
});

test('rejects unsupported collections and non-object documents', () => {
    const manifest = baseManifest();
    assert.deepEqual(
        normalizeLegacyDocument({ collection: 'users', document: {}, manifest }).errors,
        ['unknown_collection']
    );
    assert.deepEqual(
        normalizeLegacyDocument({ collection: 'dreams', document: [], manifest }).errors,
        ['document_must_be_object']
    );
});
