import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, connectFirestoreEmulator } from 'firebase-admin/firestore';
import { registerProfileWithReservedUsername } from './username-reservation.js';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.GCLOUD_PROJECT || 'demo-dream-and-go';
const registryRefPath = ['system', 'usernameRegistry'];

let app;
let db;
let registryRef;
const createdReservations = [];
const createdProfiles = [];

function uniqueUsername() {
    return `dg${randomBytes(8).toString('hex')}`.slice(0, 20);
}

before(async () => {
    assert.ok(emulatorHost, 'FIRESTORE_EMULATOR_HOST must point to Firestore Emulator');
    assert.match(emulatorHost, /^(127\\.0\\.0\\.1|localhost):\\d+$/);
    app = initializeApp({ projectId }, `registration-emulator-${process.pid}`);
    db = getFirestore(app);
    const [host, port] = emulatorHost.split(':');
    connectFirestoreEmulator(db, host, Number(port));
    registryRef = db.collection(registryRefPath[0]).doc(registryRefPath[1]);
    await registryRef.set({
        ready: true,
        schemaVersion: 1,
        legacyBackfillComplete: true
    });
});

after(async () => {
    if (!db) return;
    await Promise.all([
        ...createdReservations.map(id => db.collection('usernameReservations').doc(id).delete()),
        ...createdProfiles.map(id => db.collection('users').doc(id).delete()),
        registryRef?.delete()
    ]);
    if (app) await deleteApp(app);
});

test('Firestore Emulator atomically reserves a username and creates the profile', async () => {
    const uid = `emulator-user-${randomBytes(6).toString('hex')}`;
    const username = uniqueUsername();
    createdReservations.push(username);
    createdProfiles.push(uid);

    const result = await registerProfileWithReservedUsername(
        db, uid, username, 'emulator@example.test', () => FieldValue.serverTimestamp()
    );

    assert.deepEqual(result, { ok: true, username });
    const [reservation, profile] = await Promise.all([
        db.collection('usernameReservations').doc(username).get(),
        db.collection('users').doc(uid).get()
    ]);
    assert.equal(reservation.get('uid'), uid);
    assert.equal(profile.get('usernameNormalized'), username);
    assert.equal(profile.get('email'), 'emulator@example.test');
});

test('Firestore Emulator recovers a committed registration idempotently', async () => {
    const uid = `emulator-user-${randomBytes(6).toString('hex')}`;
    const username = uniqueUsername();
    createdReservations.push(username);
    createdProfiles.push(uid);

    const first = await registerProfileWithReservedUsername(
        db, uid, username, 'retry@example.test', () => FieldValue.serverTimestamp()
    );
    const retry = await registerProfileWithReservedUsername(
        db, uid, username, 'retry@example.test', () => FieldValue.serverTimestamp()
    );

    assert.deepEqual(first, { ok: true, username });
    assert.deepEqual(retry, { ok: true, username, recovered: true });
});

test('Firestore Emulator prevents two accounts from claiming the same username concurrently', async () => {
    const username = uniqueUsername();
    const firstUid = `emulator-user-${randomBytes(6).toString('hex')}`;
    const secondUid = `emulator-user-${randomBytes(6).toString('hex')}`;
    createdReservations.push(username);
    createdProfiles.push(firstUid, secondUid);

    const results = await Promise.all([
        registerProfileWithReservedUsername(
            db, firstUid, username, 'first@example.test', () => FieldValue.serverTimestamp()
        ),
        registerProfileWithReservedUsername(
            db, secondUid, username, 'second@example.test', () => FieldValue.serverTimestamp()
        )
    ]);

    assert.equal(results.filter(result => result.ok).length, 1);
    assert.equal(results.filter(result => result.code === 'already-exists').length, 1);

    const reservation = await db.collection('usernameReservations').doc(username).get();
    assert.ok([firstUid, secondUid].includes(reservation.get('uid')));
});

test('Firestore Emulator fails closed while the legacy username backfill gate is closed', async () => {
    const username = uniqueUsername();
    const uid = `emulator-user-${randomBytes(6).toString('hex')}`;
    createdReservations.push(username);
    createdProfiles.push(uid);

    await registryRef.set({
        ready: false,
        schemaVersion: 1,
        legacyBackfillComplete: false
    });

    const result = await registerProfileWithReservedUsername(
        db, uid, username, 'blocked@example.test', () => FieldValue.serverTimestamp()
    );

    assert.deepEqual(result, { ok: false, code: 'failed-precondition' });
    const [reservation, profile] = await Promise.all([
        db.collection('usernameReservations').doc(username).get(),
        db.collection('users').doc(uid).get()
    ]);
    assert.equal(reservation.exists, false);
    assert.equal(profile.exists, false);

    await registryRef.set({
        ready: true,
        schemaVersion: 1,
        legacyBackfillComplete: true
    });
});
