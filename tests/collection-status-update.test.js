import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTravelInput } from '../js/core/collection-input-policy.js';
import { validateMovieInput } from '../js/core/collection-input-policy.js';

for (const [name, singular] of [['travel', 'Travel'], ['movie', 'Movie']]) {
    const source = readFileSync(new URL(`../js/services/${name}.service.js`, import.meta.url), 'utf8');
    const start = source.indexOf(`    async update${singular}(userId, `);
    const end = source.indexOf(`    async delete${singular}(`, start);
    assert.ok(start !== -1 && end > start);
    const method = source.slice(start, end);

    test(`${name}: editing a status refreshes profile statistics`, async () => {
        const calls = [];
        const Service = new Function('doc', 'updateDoc', 'serverTimestamp', 'calls', 'console', 'isAuthenticatedOwner', 'isValidFirestoreDocumentId', 'auth', 'validateTravelInput', 'validateMovieInput', `
            return class Service {
                constructor() { this.db = {}; }
                clearCache(uid) { calls.push(['clear', uid]); }
                async updateUserStats(uid) { calls.push(['stats', uid]); }
                ${method}
            }
        `)(
            (_db, ...parts) => parts.join('/'),
            async (_ref, data) => { calls.push(['write', data.status]); },
            () => 'timestamp',
            calls,
            { error() {} },
            (requestedUid, activeUid) => requestedUid === activeUid,
            value => typeof value === 'string' && value.length > 0 && !value.includes('/'),
            { currentUser: { uid: 'alice' } },
            validateTravelInput,
            validateMovieInput
        );
        const status = name === 'movie' ? 'watched' : 'visited';
        const result = await new Service()[`update${singular}`]('alice', 'record-1', { status });
        assert.deepEqual(result, { success: true });
        const events = calls.map(([event]) => event);
        assert.ok(events.indexOf('stats') > events.indexOf('write'));
    });
}
