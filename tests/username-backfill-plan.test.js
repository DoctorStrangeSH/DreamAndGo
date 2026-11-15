import test from 'node:test';
import assert from 'node:assert/strict';
import { planUsernameBackfill } from '../server/username-backfill-plan.js';

const user = (id, username) => ({ id, data: { username } });
const reservation = (id, uid) => ({ id, data: { uid } });

test('creates a private-data-free plan without changing users', () => {
    const records = [user('uid-a', 'Alice'), user('uid-b', 'Bob_2')];
    const before = structuredClone(records);
    const result = planUsernameBackfill(records);
    assert.equal(result.safe, true);
    assert.equal(result.uniqueCount, 2);
    assert.deepEqual(result.missing.map(item => item.key), ['alice', 'bob_2']);
    assert.deepEqual(records, before);
    assert.equal(JSON.stringify(result).includes('email'), false);
});

test('case-insensitive legacy collisions prevent all writes', () => {
    const result = planUsernameBackfill([
        user('u1', 'SHERLOCK'), user('u2', 'sherlock')
    ]);
    assert.equal(result.safe, false);
    assert.equal(result.collisionCount, 1);
});

test('missing and malformed usernames fail closed', () => {
    const result = planUsernameBackfill([
        user('u1', 'valid'), user('u2', undefined), user('u3', 'bad name')
    ]);
    assert.equal(result.safe, false);
    assert.equal(result.invalidCount, 2);
});

test('idempotent plan recognizes valid old reservations', () => {
    const records = [user('u1', 'Alice'), user('u2', 'Bob')];
    const result = planUsernameBackfill(records, [
        reservation('alice', 'u1'), reservation('bob', 'u2')
    ]);
    assert.equal(result.safe, true);
    assert.equal(result.missing.length, 0);
});

test('mismatched and orphaned reservations stop migration', () => {
    const records = [user('u1', 'Alice')];
    for (const bad of [
        reservation('alice', 'other'),
        reservation('outsider', 'missing'),
        reservation('ALICE', 'u1'),
        reservation('alice', ''),
        reservation('alice', 'u1/evil')
    ]) {
        const result = planUsernameBackfill(records, [bad]);
        assert.equal(result.safe, false, bad.id);
        assert.ok(result.reservationConflictCount > 0);
    }
});

test('duplicate records and duplicate reservations are not silently accepted', () => {
    const users = [user('u1', 'One'), user('u1', 'One')];
    const result = planUsernameBackfill(users);
    assert.equal(result.safe, false);
    assert.equal(result.duplicateIdCount, 1);
    const repeated = planUsernameBackfill([user('u1', 'One')], [
        reservation('one', 'u1'), reservation('one', 'u1')
    ]);
    assert.equal(repeated.safe, false);
});

test('invalid planner inputs are rejected', () => {
    assert.throws(() => planUsernameBackfill(null), TypeError);
    assert.throws(() => planUsernameBackfill([], null), TypeError);
});
