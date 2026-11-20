import test from 'node:test';
import assert from 'node:assert/strict';
import { toPublicProfile } from '../js/core/public-profile.js';

test('public projection excludes private and unknown properties at every level', () => {
    const profile = toPublicProfile('person-1', {
        email: 'secret@example.com', password: 'secret', preferences: { theme: 'private' },
        privacy: { dreams: 'private' }, friends: ['hidden'], tokens: { admin: true },
        publicProfileEnabled: true, username: ' Sherlock ', displayName: ' Sherlock ', avatar: 'https://example.com/avatar.png',
        stats: { dreams: 3, friends: 2, secretBalance: 9000 }
    });
    assert.deepEqual(Object.keys(profile).sort(), ['uid','username','usernameNormalized','displayName','avatar','bio','stats'].sort());
    assert.equal(profile.username, 'Sherlock');
    assert.equal(profile.usernameNormalized, 'sherlock');
    assert.equal(profile.stats.dreams, 3);
    assert.equal(profile.stats.friends, 2);
    assert.equal(JSON.stringify(profile).includes('secret'), false);
    assert.equal(JSON.stringify(profile).includes('example.com/avatar.png'), true);
});

test('public projection sanitizes malformed and unsafe fields', () => {
    const profile = toPublicProfile('person-2', {
        publicProfileEnabled: true, username: 10, avatar: 'javascript:alert(1)', bio: { private: true },
        stats: { dreams: -7, books: '7', movies: 1.2, travels: 2 }
    });
    assert.equal(profile.username, '');
    assert.equal(profile.avatar, '');
    assert.equal(profile.bio, '');
    assert.equal(profile.stats.dreams, 0);
    assert.equal(profile.stats.books, 0);
    assert.equal(profile.stats.movies, 0);
    assert.equal(profile.stats.travels, 2);
});


test('public profile projection is denied unless the owner explicitly opts in', () => {
    assert.equal(toPublicProfile('private-user', { username: 'private_user' }), null);
    assert.equal(toPublicProfile('private-user', { username: 'private_user', publicProfileEnabled: false }), null);
    assert.equal(toPublicProfile('public-user', { username: 'public_user', publicProfileEnabled: true }).uid, 'public-user');
});
