import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicProfile } from './public-profile.js';

const fullProfile = {
    email: 'private@example.test',
    username: 'Dreamer_1',
    usernameNormalized: 'dreamer_1',
    displayName: 'Dreamer',
    avatar: 'https://cdn.example.test/avatar.png',
    bio: 'Hello',
    location: 'Berlin',
    website: 'https://example.test',
    createdAt: '2026-11-01T12:00:00.000Z',
    lastLogin: '2026-11-22T10:00:00.000Z',
    stats: {
        travels: 4,
        restaurants: 8,
        movies: 12,
        books: 3,
        dreams: 6,
        friends: 99
    },
    achievements: [{ title: 'Secret achievement' }],
    friends: ['private-friend-uid'],
    preferences: { theme: 'dark', language: 'ru' },
    privacy: {
        travels: 'public',
        food: 'private',
        movies: 'public',
        books: 'public',
        dreams: 'private'
    }
};

test('public projection contains only allowlisted public fields', () => {
    const result = buildPublicProfile('user-123', fullProfile);
    assert.deepEqual(Object.keys(result).sort(), [
        'avatar', 'bio', 'createdAt', 'displayName', 'location',
        'stats', 'uid', 'username', 'website'
    ]);
    assert.equal(result.uid, 'user-123');
    assert.equal(result.username, 'dreamer_1');
    assert.equal(result.email, undefined);
    assert.equal(result.lastLogin, undefined);
    assert.equal(result.preferences, undefined);
    assert.equal(result.achievements, undefined);
    assert.equal(result.friends, undefined);
});

test('statistics are included only when the corresponding privacy flag is explicitly public', () => {
    const result = buildPublicProfile('user-123', fullProfile);
    assert.deepEqual(result.stats, {
        travels: 4,
        movies: 12,
        books: 3
    });
    assert.equal(result.stats.restaurants, undefined);
    assert.equal(result.stats.dreams, undefined);
    assert.equal(result.stats.friends, undefined);
});

test('missing or unknown privacy settings hide statistics by default', () => {
    const result = buildPublicProfile('user-123', {
        username: 'dreamer',
        stats: { travels: 99, movies: 8 },
        privacy: { travels: 'everyone' }
    });
    assert.deepEqual(result.stats, {});
});

test('untrusted strings are bounded and unsafe URLs are removed', () => {
    const result = buildPublicProfile('user-123', {
        username: 'dreamer',
        displayName: 'x'.repeat(120),
        bio: 'b'.repeat(700),
        location: 'l'.repeat(140),
        avatar: 'javascript:alert(1)',
        website: 'https://user:pass@example.test'
    });
    assert.equal(result.displayName.length, 80);
    assert.equal(result.bio.length, 500);
    assert.equal(result.location.length, 100);
    assert.equal(result.avatar, null);
    assert.equal(result.website, null);
});

test('invalid UID, profile object or username is rejected', () => {
    assert.throws(() => buildPublicProfile('../other', fullProfile), TypeError);
    assert.throws(() => buildPublicProfile('user-123', null), TypeError);
    assert.throws(() => buildPublicProfile('user-123', { username: 'bad name' }), TypeError);
});

test('only valid creation timestamps are copied', () => {
    const invalid = buildPublicProfile('user-123', {
        username: 'dreamer',
        createdAt: { unexpected: 'data' }
    });
    assert.equal(invalid.createdAt, undefined);
});
