import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { registerProfileWithReservedUsername } from './username-reservation.js';
import { getRegistrationState } from './registration-state.js';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Must run against Firestore emulator only');
const app = initializeApp({ projectId: 'demo-dreamandgo-chat-rules' }, 'username-reservation-tests');
const db = getFirestore(app);
const clock = () => FieldValue.serverTimestamp();
const registry = db.doc('system/usernameRegistry');
const register = (uid, username) =>
    registerProfileWithReservedUsername(db, uid, username, uid + '@example.test', clock);

test('migration gate blocks server registration without writing a profile', async () => {
    await registry.set({ ready: false, schemaVersion: 1, legacyBackfillComplete: false });
    const outcome = await register('registry-closed-user', 'Closed_Nickname');
    assert.deepEqual(outcome, { ok: false, code: 'failed-precondition' });
    assert.equal((await db.doc('users/registry-closed-user').get()).exists, false);
    assert.equal((await db.doc('usernameReservations/closed_nickname').get()).exists, false);
    const status = await getRegistrationState(db, 'registry-closed-user');
    assert.equal(status.status, 'temporarily-unavailable');
});

test('concurrent registrations for the same normalized nickname have one winner', async () => {
    await registry.set({ ready: true, schemaVersion: 1, legacyBackfillComplete: true });
    const requests = await Promise.all([
        register('registry-race-alice', 'Race_User_1'),
        register('registry-race-bob', 'RACE_USER_1'),
        register('registry-race-charlie', 'race_user_1')
    ]);
    assert.equal(requests.filter(x => x.ok).length, 1);
    assert.equal(requests.filter(x => x.code === 'already-exists').length, 2);
    const owner = (await db.doc('usernameReservations/race_user_1').get()).get('uid');
    const users = ['registry-race-alice', 'registry-race-bob', 'registry-race-charlie'];
    assert.equal(users.includes(owner), true);
    const profiles = await Promise.all(users.map(uid => db.doc('users/' + uid).get()));
    assert.equal(profiles.filter(x => x.exists).length, 1);
    assert.equal(profiles.find(x => x.exists).id, owner);
    assert.equal(profiles.find(x => x.exists).get('usernameNormalized'), 'race_user_1');
});

test('lost response retry is idempotent and never overwrites profile fields', async () => {
    const username = 'Retry_Account_1';
    assert.equal((await register('registry-retry-user', username)).ok, true);
    const user = db.doc('users/registry-retry-user');
    await user.update({ bio: 'Важное описание', stats: { friends: 9 } });
    const before = await user.get();
    const repeated = await Promise.all([
        register('registry-retry-user', 'RETRY_ACCOUNT_1'),
        register('registry-retry-user', 'retry_account_1')
    ]);
    for (const result of repeated) {
        assert.deepEqual(result, {
            ok: true, username: 'retry_account_1', recovered: true
        });
    }
    const after = await user.get();
    assert.equal(after.get('bio'), 'Важное описание');
    assert.deepEqual(after.get('stats'), { friends: 9 });
    assert.deepEqual(after.get('createdAt'), before.get('createdAt'));
    assert.equal((await getRegistrationState(db, 'registry-retry-user')).status, 'complete');
});

test('different uid cannot steal existing reservation or overwrite its owner', async () => {
    const existing = await db.doc('usernameReservations/race_user_1').get();
    const owner = existing.get('uid');
    const result = await register('registry-attacker', 'RaCe_UsEr_1');
    assert.deepEqual(result, { ok: false, code: 'already-exists' });
    assert.equal((await db.doc('usernameReservations/race_user_1').get()).get('uid'), owner);
    assert.equal((await db.doc('users/registry-attacker').get()).exists, false);
});

test('Auth-only signup can finish after reconnect with an available nickname', async () => {
    const statusBefore = await getRegistrationState(db, 'registry-reconnect-user');
    assert.equal(statusBefore.status, 'needs-profile');
    const created = await register('registry-reconnect-user', 'Reconnect_User_1');
    assert.equal(created.ok, true);
    const statusAfter = await getRegistrationState(db, 'registry-reconnect-user');
    assert.equal(statusAfter.status, 'complete');
});

test.after(async () => { await deleteApp(app); });
