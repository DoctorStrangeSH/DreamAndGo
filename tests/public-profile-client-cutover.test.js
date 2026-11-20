import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const friends = readFileSync(new URL('../js/services/friends.service.js', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../js/modules/profile/profile.js', import.meta.url), 'utf8');
const callable = readFileSync(new URL('../js/services/public-profile-callable.service.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');

test('friend search and friend lists use App Check protected public profile callables', () => {
    assert.match(friends, /findPublicProfileByUsername\(normalized\)/);
    assert.match(friends, /getPublicProfilesByIds\(records\.map/);
    assert.doesNotMatch(friends, /collection\(this\.db, ['"]users['"]\)/);
    assert.doesNotMatch(friends, /getDoc\(doc\(this\.db, ['"]users['"]/);
    assert.match(server, /getPublicProfilesV2 = onCall\(\{ region: 'europe-west3', enforceAppCheck: true \}/);
});

test('public profile route uses server projection for other accounts and private document for owner only', () => {
    assert.match(profile, /if \(!isOwnProfile\) \{[\s\S]*?getPublicProfilesByIds\(\[userId\]\)/);
    assert.match(profile, /getDoc\(doc\(db, 'users', userId\)\)/);
    assert.doesNotMatch(profile, /toPublicProfile\(/);
});

test('client batch requests are split into bounded groups of at most fifty', () => {
    assert.match(callable, /offset \+= 50/);
    assert.match(callable, /userIds\.slice\(offset, offset \+ 50\)/);
    assert.match(callable, /findPublicProfileByUsernameV2/);
    assert.match(callable, /getPublicProfilesV2/);
});
