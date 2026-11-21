import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTravelInput } from '../js/core/collection-input-policy.js';

const source = readFileSync(new URL('../js/services/travel.service.js', import.meta.url), 'utf8');
const start = source.indexOf('    async addTravel(userId, travelData) {');
const end = source.indexOf('    async updateTravel(', start);
assert.ok(start >= 0 && end > start, 'TravelService.addTravel must exist');
const method = source.slice(start, end);

function service({ write, read }) {
    const state = { writeCalls: 0, readCalls: 0, cacheClears: 0, statUpdates: 0 };
    const Travel = new Function('collection', 'addDoc', 'getDoc', 'serverTimestamp', 'console', 'state', 'isAuthenticatedOwner', 'auth', 'validateTravelInput',
        `return class Travel {
            constructor() { this.db = {}; }
            clearCache() { state.cacheClears++; }
            async updateUserStats() { state.statUpdates++; }
            async updateUserStatsBestEffort(uid) {
                try { await this.updateUserStats(uid); }
                catch (error) { console.warn('stats refresh failed', error); }
            }
            ${method}
        }`
    )(
        (_db, ...segments) => segments.join('/'),
        async (...args) => { state.writeCalls++; return write(...args); },
        async (...args) => { state.readCalls++; return read(...args); },
        () => ({ timestamp: true }),
        { error() {}, warn() {} },
        state,
        (requestedUid, activeUid) => requestedUid === activeUid,
        { currentUser: { uid: 'alice' } },
        validateTravelInput
    );
    return { instance: new Travel(), state };
}

test('successful travel write is not reported as failure if read-back fails', async () => {
    const { instance, state } = service({
        write: async () => ({ id: 'new-travel' }),
        read: async () => { throw new Error('network lost after commit'); }
    });
    const result = await instance.addTravel('alice', { title: 'Путешествие', type: 'city', status: 'planned', location: '', description: '', budget: { planned: 0, spent: 0, currency: 'RUB' }, rating: 0, notes: '', photos: [] });
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
    const result = await instance.addTravel('alice', { title: 'Draft', type: 'city', status: 'planned', location: '', description: '', budget: { planned: 0, spent: 0, currency: 'RUB' }, rating: 0, notes: '', photos: [] });
    assert.equal(result.success, true);
    assert.equal(result.travel.title, 'Saved title');
});

test('failed travel write reports failure and does not claim success', async () => {
    const { instance, state } = service({
        write: async () => { throw new Error('permission denied'); },
        read: async () => { throw new Error('must not read'); }
    });
    const result = await instance.addTravel('alice', { title: 'Denied', type: 'city', status: 'planned', location: '', description: '', budget: { planned: 0, spent: 0, currency: 'RUB' }, rating: 0, notes: '', photos: [] });
    assert.equal(result.success, false);
    assert.equal(state.writeCalls, 1);
    assert.equal(state.readCalls, 0);
});
