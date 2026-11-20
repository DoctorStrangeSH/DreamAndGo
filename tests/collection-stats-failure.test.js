import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const collections = [
    ['dreams', 'getDreams'],
    ['restaurant', 'getRestaurants'],
    ['movie', 'getUserMovies'],
    ['travel', 'getTravels']
];

for (const [name, reader] of collections) {
    const source = readFileSync(new URL(`../js/services/${name}.service.js`, import.meta.url), 'utf8');
    const start = source.indexOf('    async updateUserStats(userId) {');
    const end = source.indexOf('\n    }', start);
    assert.ok(start >= 0 && end > start, `${name} has a stats method`);
    const method = source.slice(start, end + 6);

    test(`${name}: read failure cannot overwrite saved counters`, async () => {
        let writes = 0;
        const Collection = new Function('doc', 'updateDoc', 'console', 'isAuthenticatedOwner', 'auth', `
            return class Collection {
                constructor() { this.db = {}; }
                ${reader}(_uid, _filters, options) {
                    this.strictRead = options?.throwOnError === true;
                    throw new Error('Firebase temporarily unavailable');
                }
                ${method}
            };
        `)(
            () => 'user-doc',
            async () => { writes++; },
            { error() {} },
            (requestedUid, activeUid) => requestedUid === activeUid,
            { currentUser: { uid: 'alice' } }
        );
        const instance = new Collection();
        await instance.updateUserStats('alice');
        assert.equal(instance.strictRead, true);
        assert.equal(writes, 0);
    });
}
