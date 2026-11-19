import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/services/travel.service.js', import.meta.url), 'utf8');
const start = source.indexOf('    async addTravel(userId, travelData) {');
const end = source.indexOf('    async updateTravel(', start);
assert.ok(start >= 0 && end > start, 'TravelService.addTravel must exist');
const method = source.slice(start, end);

function service({ write, read }) {
    const state = { writeCalls: 0, readCalls: 0, cacheClears: 0, statUpdates: 0 };
    const Travel = new Function('collection', 'addDoc', 'getDoc', 'serverTimestamp', 'console', 'state',
        `return class Travel {
            constructor() { this.db = {}; }
            clearCache() { state.cacheClears++; }
            async updateUserStats() { state.statUpdates++; }
            ${method}
        }`
    )(
        (_db, ...segments) => segments.join('/'),
        async (...args) => { state.writeCalls++; return write(...args); },
        async (...args) => { state.readCalls++; return read(...args); },
        () => ({ timestamp: true }),
        { error() {}, warn() {} },
        state
    );
    return { instance: new Travel(), state };
}

test('successful travel write is not reported as failure if read-back fails', async () => {
    const { instance, state } = service({
        write: async () => ({ id: 'new-travel' }),
        read: async () => { throw new Error('network lost after commit'); }
    });
    const result = await instance.addTravel('alice', { title: 'Путешествие' });
    assert.equal(result.success, true);
    assert.equal(result.id, 'new-travel');
    assert.equal(result.travel.title, 'Путешествие');
    assert.equal(state.writeCalls, 1);
    assert.equal(state.readCalls, 1);
    assert.equal(state.cacheClears, 1);
    assert.equal(state.statUpdates, 1);
});

test('successful read-back returns server document', async () => {
    const { instance } = service({
        write: async () => ({ id: 'travel-2' }),
        read: async () => ({ exists: () => true, data: () => ({ title: 'Saved title' }) })
    });
    const result = await instance.addTravel('alice', { title: 'Draft' });
    assert.equal(result.success, true);
    assert.equal(result.travel.title, 'Saved title');
});

test('failed travel write reports failure and does not claim success', async () => {
    const { instance, state } = service({
        write: async () => { throw new Error('permission denied'); },
        read: async () => { throw new Error('must not read'); }
    });
    const result = await instance.addTravel('alice', { title: 'Denied' });
    assert.equal(result.success, false);
    assert.equal(state.writeCalls, 1);
    assert.equal(state.readCalls, 0);
});
