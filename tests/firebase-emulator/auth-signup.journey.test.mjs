import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from 'firebase/app';
import {
    getAuth, connectAuthEmulator, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, signOut
} from 'firebase/auth';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { registerProfileWithReservedUsername } from '../../server/username-reservation.js';
import { getRegistrationState } from '../../server/registration-state.js';

// Explicitly fail closed: never create test users in a real Firebase project.
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Auth emulator required');
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator required');

const projectId = 'demo-dreamandgo-chat-rules';
const client = initializeClientApp({
    apiKey: 'fake-emulator-key', projectId, authDomain: projectId + '.firebaseapp.com'
}, 'candidate-signup-journey');
const auth = getAuth(client);
connectAuthEmulator(auth, 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST, {
    disableWarnings: true
});
const admin = initializeAdminApp({ projectId }, 'candidate-signup-admin');
const db = getFirestore(admin);
const registry = db.doc('system/usernameRegistry');
const register = (uid, username, email) =>
    registerProfileWithReservedUsername(db, uid, username, email,
        () => FieldValue.serverTimestamp());

test('Firebase Auth signup, delayed profile, sign out and sign in preserve one identity', async () => {
    const email = 'recovery-journey@example.test';
    const password = 'emulator-password-123';
    await registry.set({
        ready: false, schemaVersion: 1, legacyBackfillComplete: false
    });
    const created = await createUserWithEmailAndPassword(auth, email, password);
    const uid = created.user.uid;
    assert.equal((await getRegistrationState(db, uid)).status, 'temporarily-unavailable');
    const denied = await register(uid, 'Journey_User_1', email);
    assert.equal(denied.code, 'failed-precondition');
    assert.equal((await db.doc('users/' + uid).get()).exists, false);

    // Simulate verified migration and user reconnection.
    await registry.set({
        ready: true, schemaVersion: 1, legacyBackfillComplete: true
    });
    assert.equal((await getRegistrationState(db, uid)).status, 'needs-profile');
    const completed = await register(uid, 'Journey_User_1', email);
    assert.equal(completed.ok, true);
    await signOut(auth);
    const again = await signInWithEmailAndPassword(auth, email, password);
    assert.equal(again.user.uid, uid);
    assert.equal((await getRegistrationState(db, again.user.uid)).status, 'complete');
    const retry = await register(uid, 'JOURNEY_USER_1', email);
    assert.equal(retry.recovered, true);
    assert.equal((await db.doc('usernameReservations/journey_user_1').get()).get('uid'), uid);

    await signOut(auth);
    const anotherEmail = 'recovery-competitor@example.test';
    const second = await createUserWithEmailAndPassword(auth, anotherEmail, password);
    assert.notEqual(second.user.uid, uid);
    const collision = await register(second.user.uid, 'journey_user_1', anotherEmail);
    assert.equal(collision.code, 'already-exists');
    assert.equal((await db.doc('users/' + second.user.uid).get()).exists, false);
});

test.after(async () => {
    await signOut(auth).catch(() => {});
    await deleteClientApp(client);
    await deleteAdminApp(admin);
});
