import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const services = [
    'dreams.service.js',
    'travel.service.js',
    'book.service.js',
    'movie.service.js',
    'restaurant.service.js'
];

test('private collection services never persist isPublic visibility flags', () => {
    for (const service of services) {
        const source = readFileSync(new URL(`../js/services/${service}`, import.meta.url), 'utf8');
        assert.doesNotMatch(
            source,
            /\bisPublic\s*:/,
            `${service} must not persist visibility flags in a private users subcollection`
        );
    }
});
