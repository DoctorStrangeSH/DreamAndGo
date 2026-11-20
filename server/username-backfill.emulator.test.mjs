import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { runUsernameReservationBackfill } from './username-backfill.js';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Must run against Firestore emulator only');
const app = initializeApp({ projectId: 'demo-dreamandgo-chat-rules' }, 'username-backfill-tests');
const db = getFirestore(app);
const timestamp = () => FieldValue.serverTimestamp();
const collections = {
    usersCollection: 'migrationTestUsers',
    reservationsCollection: 'migrationTestReservations',
    registryCollection: 'system',
    registryDocument: 'usernameRegistryBackfillTest'
};
const runBackfill = options => runUsernameReservationBackfill(db, { ...collections, ...options });
const registry = db.collection('system').doc(collections.registryDocument);

test('dry-run is read-only and apply creates only missing reservations without opening registry', async () => {
    const control = registry;
    await control.set({ ready: false, schemaVersion: 1, legacyBackfillComplete: false });
    await db.collection(collections.usersCollection).doc('backfill-user-a').set({ username: 'Backfill_Alice' });
    await db.collection(collections.usersCollection).doc('backfill-user-b').set({ username: 'Backfill_Bob' });
    await db.collection(collections.reservationsCollection).doc('backfill_alice').set({
        uid: 'backfill-user-a', username: 'Backfill_Alice'
    });

    const dryRun = await runBackfill();
    assert.equal(dryRun.safe, true);
    assert.equal(dryRun.missingReservations, 1);
    assert.equal(dryRun.applied, false);
    assert.equal((await db.collection(collections.reservationsCollection).doc('backfill_bob').get()).exists, false);

    await assert.rejects(
        runBackfill({ apply: true, registrationFrozen: false, serverTimestamp: timestamp }),
        /frozen registration window/
    );
    const applied = await runBackfill({
        apply: true, registrationFrozen: true, serverTimestamp: timestamp
    });
    assert.equal(applied.safe, true);
    assert.equal(applied.created, 1);
    assert.equal(applied.postflightVerified, true);
    assert.equal(applied.registryActivated, false);
    assert.equal((await db.doc('usernameReservations/backfill_bob').get()).get('uid'), 'backfill-user-b');
    assert.equal((await control.get()).get('ready'), false);

    const repeated = await runUsernameReservationBackfill(db, {
        apply: true, registrationFrozen: true, serverTimestamp: timestamp
    });
    assert.equal(repeated.missingReservations, 0);
    assert.equal(repeated.created, 0);
    assert.equal(repeated.postflightVerified, true);
    assert.equal((await control.get()).get('ready'), false);
});

test('case-insensitive legacy collisions block every write and keep registry closed', async () => {
    const control = db.doc('system/usernameRegistry');
    await control.set({ ready: false, schemaVersion: 1, legacyBackfillComplete: false });
    await db.collection(collections.usersCollection).doc('backfill-collision-a').set({ username: 'Collision_Name' });
    await db.collection(collections.usersCollection).doc('backfill-collision-b').set({ username: 'collision_name' });

    const result = await runUsernameReservationBackfill(db, {
        apply: true, registrationFrozen: true, serverTimestamp: timestamp
    });
    assert.equal(result.safe, false);
    assert.equal(result.reason, 'preflight-blocked');
    assert.equal(result.applied, false);
    assert.equal((await db.collection(collections.reservationsCollection).doc('collision_name').get()).exists, false);
    assert.equal((await control.get()).get('ready'), false);
});

test('active registry prevents a backfill from running', async () => {
    await registry.set({
        ready: true, schemaVersion: 1, legacyBackfillComplete: true
    });
    await assert.rejects(
        runBackfill({
            apply: true, registrationFrozen: true, serverTimestamp: timestamp
        }),
        /already active/
    );
});

test.after(async () => { await deleteApp(app); });
