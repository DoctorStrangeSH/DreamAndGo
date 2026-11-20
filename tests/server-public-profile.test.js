import test from 'node:test';
import assert from 'node:assert/strict';
import { publicProfileFromPrivate, loadPublicProfile, findPublicProfileByUsername, loadPublicProfiles } from '../server/public-profile-service.js';

const privateUser = {
    publicProfileEnabled: true,
    username: 'Sherlock', displayName: ' Sherlock ',
    email: 'private@example.com', phone: '+7-000', roles: ['admin'],
    preferences: { private: true }, privacy: { dreams: 'private' },
    avatar: 'https://example.com/avatar.png', bio: 'Hello',
    stats: { friends: 2, dreams: 4, secretBalance: 999 }
};

test('server projection never returns email, roles or arbitrary nested data', () => {
    const result = publicProfileFromPrivate('alice', privateUser);
    assert.deepEqual(Object.keys(result).sort(),
        ['uid', 'username', 'displayName', 'avatar', 'bio', 'stats'].sort());
    assert.deepEqual(result.stats, { travels: 0, restaurants: 0, movies: 0,
        books: 0, dreams: 4, friends: 2 });
    assert.equal(JSON.stringify(result).includes('private@example.com'), false);
    assert.equal(JSON.stringify(result).includes('secretBalance'), false);
});

test('malformed public fields are bounded or rejected', () => {
    const result = publicProfileFromPrivate('alice', {
        publicProfileEnabled: true, username: 'x'.repeat(200), displayName: [], avatar: 'javascript:alert(1)',
        bio: 'b'.repeat(2000), stats: { friends: -1, dreams: '400' }
    });
    assert.equal(result.username.length, 40);
    assert.equal(result.bio.length, 500);
    assert.equal(result.avatar, '');
    assert.equal(result.stats.friends, 0);
    assert.equal(result.stats.dreams, 0);
    assert.equal(publicProfileFromPrivate('bad/id', {}), null);
});

test('profile lookup denies anonymous and invalid input without querying Firestore', async () => {
    let calls = 0;
    const db = { collection: () => { calls++; throw Error('must not query'); } };
    assert.deepEqual(await loadPublicProfile(db, null, 'alice'), { ok: false, code: 'unauthenticated' });
    assert.deepEqual(await loadPublicProfile(db, 'bob', 'bad/id'), { ok: false, code: 'invalid-argument' });
    assert.equal(calls, 0);
});

test('authenticated lookup reads one document and returns only public fields', async () => {
    const ids = [];
    const db = { collection(name) {
        assert.equal(name, 'users');
        return { doc(uid) {
            ids.push(uid);
            return { async get() { return { exists: true, data: () => privateUser }; } };
        } };
    } };
    const result = await loadPublicProfile(db, 'bob', 'alice');
    assert.equal(result.ok, true);
    assert.equal(result.profile.username, 'Sherlock');
    assert.equal('email' in result.profile, false);
    assert.equal('publicProfileEnabled' in result.profile, false);
    assert.deepEqual(ids, ['alice']);
});

test('missing users return a generic not-found status', async () => {
    const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) };
    assert.deepEqual(await loadPublicProfile(db, 'bob', 'alice'), { ok: false, code: 'not-found' });
});

test('username lookup rejects unauthenticated and non-exact searches', async () => {
    let count = 0;
    const db = { collection: () => { count++; throw Error('must not query'); } };
    assert.deepEqual(await findPublicProfileByUsername(db, null, 'alice'),
        { ok: false, code: 'unauthenticated' });
    assert.deepEqual(await findPublicProfileByUsername(db, 'bob', 'al*'),
        { ok: false, code: 'invalid-argument' });
    assert.equal(count, 0);
});

test('username lookup returns sanitized profile and never raw email', async () => {
    const operations = [];
    const db = { collection(name) {
        assert.equal(name, 'users');
        return { where(field, operator, value) {
            operations.push([field, operator, value]);
            return { limit(n) {
                assert.equal(n, 1);
                return { get: async () => ({ docs: [{ id: 'alice', data: () => privateUser }] }) };
            } };
        } };
    } };
    const found = await findPublicProfileByUsername(db, 'bob', ' SHERLOCK ');
    assert.equal(found.ok, true);
    assert.equal(found.profile.uid, 'alice');
    assert.equal('email' in found.profile, false);
    assert.deepEqual(operations, [['usernameNormalized', '==', 'sherlock']]);
});

test('username lookup supports exact legacy fallback and missing users', async () => {
    const operations = [];
    const db = { collection: () => ({ where(field, op, value) {
        operations.push([field, value]);
        return { limit: () => ({ get: async () => ({ docs: [] }) }) };
    } }) };
    const result = await findPublicProfileByUsername(db, 'bob', 'Sherlock');
    assert.deepEqual(result, { ok: true, profile: null });
    assert.deepEqual(operations, [
        ['usernameNormalized', 'sherlock'], ['username', 'Sherlock']
    ]);
});


test('server projection fails closed when public visibility is absent or disabled', () => {
    assert.equal(publicProfileFromPrivate('private-user', { username: 'private_user' }), null);
    assert.equal(publicProfileFromPrivate('private-user', {
        username: 'private_user', publicProfileEnabled: false
    }), null);
});


test('direct profile lookup does not reveal whether a private account exists', async () => {
    const db = { collection: () => ({ doc: () => ({
        get: async () => ({ exists: true, data: () => ({ username: 'private_user' }) })
    }) }) };
    assert.deepEqual(await loadPublicProfile(db, 'bob', 'private-user'), {
        ok: false, code: 'not-found'
    });
});

test('username search returns no projection for accounts without explicit opt-in', async () => {
    const db = { collection: () => ({ where: () => ({
        limit: () => ({ get: async () => ({
            docs: [{ id: 'private-user', data: () => ({ username: 'private_user' }) }]
        }) })
    }) }) };
    assert.deepEqual(await findPublicProfileByUsername(db, 'bob', 'private_user'), {
        ok: true, profile: null
    });
});


test('batch profile lookup validates size and omits private or missing users', async () => {
    const calls = [];
    const records = new Map([
        ['alice', { exists: true, id: 'alice', data: () => ({ ...privateUser, publicProfileEnabled: true }) }],
        ['bob', { exists: true, id: 'bob', data: () => ({ username: 'bob', publicProfileEnabled: false }) }],
        ['carol', { exists: false, id: 'carol' }]
    ]);
    const db = {
        collection(name) {
            assert.equal(name, 'users');
            return { doc(uid) { calls.push(uid); return { uid }; } };
        },
        async getAll(...refs) {
            return refs.map(ref => records.get(ref.uid));
        }
    };
    assert.deepEqual(await loadPublicProfiles(db, null, ['alice']), {
        ok: false, code: 'unauthenticated'
    });
    assert.deepEqual(await loadPublicProfiles(db, 'actor', Array(51).fill('alice')), {
        ok: false, code: 'invalid-argument'
    });
    const result = await loadPublicProfiles(db, 'actor', ['alice', 'bob', 'carol', 'alice']);
    assert.equal(result.ok, true);
    assert.equal(result.profiles.length, 1);
    assert.equal(result.profiles[0].uid, 'alice');
    assert.equal('email' in result.profiles[0], false);
    assert.equal('publicProfileEnabled' in result.profiles[0], false);
    assert.deepEqual(calls, ['alice', 'bob', 'carol']);
});
