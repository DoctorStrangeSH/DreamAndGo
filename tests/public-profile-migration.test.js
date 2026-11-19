import test from 'node:test';
import assert from 'node:assert/strict';
import { planPublicProfileMigration } from '../js/core/public-profile-migration.js';

test('detects legacy usernames colliding only by case', () => {
    const plan = planPublicProfileMigration([
        { id: 'a', data: { username: 'Sherlock' } },
        { id: 'b', data: { username: 'sherlock' } }
    ]);
    assert.equal(plan.conflictCount, 1);
    assert.equal(plan.invalidCount, 0);
});

test('does not silently discard invalid or missing usernames', () => {
    const plan = planPublicProfileMigration([
        { id: 'a', data: { username: 'valid_user' } },
        { id: 'b', data: { username: '' } },
        { id: 'c', data: { username: 'bad user' } }
    ]);
    assert.equal(plan.invalidCount, 2);
    assert.equal(plan.profiles.length, 1);
});

test('passes only public allowlisted fields into migration output', () => {
    const plan = planPublicProfileMigration([{ id: 'a', data: {
        username: 'valid_user', email: 'private@example.com', preferences: { theme: 'secret' }
    } }]);
    assert.equal(plan.conflictCount, 0);
    assert.equal(plan.invalidCount, 0);
    assert.equal(plan.profiles[0].usernameNormalized, 'valid_user');
    assert.equal('email' in plan.profiles[0], false);
    assert.equal('preferences' in plan.profiles[0], false);
});
