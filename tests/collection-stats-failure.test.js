import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const collections = ['dreams', 'restaurant', 'movie', 'travel'];

for (const name of collections) {
    const source = readFileSync(new URL('../js/services/' + name + '.service.js', import.meta.url), 'utf8');
    const start = source.indexOf('    async updateUserStats(userId) {');
    const end = source.indexOf('\n    }', start);
    assert.ok(start >= 0 && end > start, name + ' has a stats method');
    const method = source.slice(start, end + 6);

    test(name + ': stats refresh delegates to trusted server and enforces active owner', async () => {
        const refreshCalls = [];
        const Collection = new Function('console', 'isAuthenticatedOwner', 'auth', 'refreshUserStats',
            'return class Collection {' + method + '};')(
            { error() {} },
            (requestedUid, activeUid) => requestedUid === activeUid,
            { currentUser: { uid: 'alice' } },
            async uid => { refreshCalls.push(uid); return true; }
        );
        const instance = new Collection();
        await instance.updateUserStats('alice');
        await instance.updateUserStats('bob');
        assert.deepEqual(refreshCalls, ['alice']);
    });
}
