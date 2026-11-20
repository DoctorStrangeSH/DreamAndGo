import test from 'node:test';
import assert from 'node:assert/strict';
import { planPublicProfileMigration } from '../js/core/public-profile-migration.js';

test('detects legacy usernames colliding only by case', () => {
    const plan = planPublicProfileMigration([
        { id: 'a', data: { username: 'Sherlock', publicProfileEnabled: true } },
        { id: 'b', data: { username: 'sherlock', publicProfileEnabled: true } }
    ]);
    assert.equal(plan.conflictCount, 1);
    assert.equal(plan.invalidCount, 0);
});

test('does not silently discard invalid or missing usernames', () => {
    const plan = planPublicProfileMigration([
        { id: 'a', data: { username: 'valid_user', publicProfileEnabled: true } },
        { id: 'b', data: { username: '', publicProfileEnabled: true } },
        { id: 'c', data: { username: 'bad user', publicProfileEnabled: true } }
    ]);
    assert.equal(plan.invalidCount, 2);
    assert.equal(plan.profiles.length, 1);
});

test('passes only public allowlisted fields into migration output', () => {
    const plan = planPublicProfileMigration([{ id: 'a', data: {
        username: 'valid_user', publicProfileEnabled: true, email: 'private@example.com', preferences: { theme: 'secret' }
    } }]);
    assert.equal(plan.conflictCount, 0);
    assert.equal(plan.invalidCount, 0);
    assert.equal(plan.profiles[0].usernameNormalized, 'valid_user');
    assert.equal('email' in plan.profiles[0], false);
    assert.equal('preferences' in plan.profiles[0], false);
});


test('migration skips private profiles without counting them as invalid usernames', () => {
    const plan = planPublicProfileMigration([
        { id: 'private', data: { username: 'private_user', publicProfileEnabled: false } },
        { id: 'unset', data: { username: 'legacy_user' } },
        { id: 'public', data: { username: 'public_user', publicProfileEnabled: true } }
    ]);
    assert.equal(plan.profiles.length, 1);
    assert.equal(plan.profiles[0].uid, 'public');
    assert.equal(plan.disabledCount, 2);
    assert.equal(plan.invalidCount, 0);
});


test('private accounts still participate in case-insensitive username collision checks', () => {
    const plan = planPublicProfileMigration([
        { id: 'private', data: { username: 'Sherlock', publicProfileEnabled: false } },
        { id: 'public', data: { username: 'sherlock', publicProfileEnabled: true } }
    ]);
    assert.equal(plan.conflictCount, 1);
    assert.equal(plan.profiles.length, 1);
    assert.equal(plan.profiles[0].uid, 'public');
    assert.equal(plan.disabledCount, 1);
});
