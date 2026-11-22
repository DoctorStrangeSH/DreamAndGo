import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createProfileAccountCallables } from './profile-account-callables.js';
import { buildPublicProfile } from './public-profile.js';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const available = Boolean(emulatorHost);
const projectId = process.env.GCLOUD_PROJECT || 'demo-dream-and-go';
let app;
let db;
let endpoints;
const createdUsers = [];
const createdNames = [];

class EmulatorHttpsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function token() {
    return randomBytes(8).toString('hex');
}

function makeUsername() {
    return `dg${token()}`.slice(0, 20);
}

async function seedProfile({ uid, username, visibility = 'private' }) {
    const normalized = username.toLowerCase();
    await Promise.all([
        db.collection('users').doc(uid).set({
            email: `${uid}@private.example`,
            username,
            usernameNormalized: normalized,
            displayName: 'Before',
            bio: 'Old bio',
            location: 'Old city',
            privacy: {
                profile: visibility,
                travels: 'public',
                food: 'private',
                movies: 'private',
                books: 'private',
                dreams: 'private'
            },
            stats: { travels: 7, restaurants: 2, friends: 99 },
            lastLogin: FieldValue.serverTimestamp()
        }),
        db.collection('usernameReservations').doc(normalized).set({ uid, username })
    ]);
    createdUsers.push(uid);
    createdNames.push(normalized);
}

before(async () => {
    if (!available) return;
    assert.match(emulatorHost, /^(127\.0\.0\.1|localhost):\d+$/);
    app = initializeApp({ projectId }, `profile-account-emulator-${process.pid}`);
    db = getFirestore(app);
    await db.collection('system').doc('usernameRegistry').set({
        ready: true,
        schemaVersion: 1,
        legacyBackfillComplete: true
    });
    const registrations = [];
    endpoints = createProfileAccountCallables({
        onCall(options, handler) {
            registrations.push({ options, handler });
            return handler;
        },
        HttpsError: EmulatorHttpsError,
        getFirestore: () => db,
        FieldValue,
        buildPublicProfile
    });
    assert.equal(registrations.length, 2);
    assert.ok(registrations.every(item => item.options.enforceAppCheck === true));
    assert.ok(registrations.every(item => item.options.region === 'europe-west3'));
});

after(async () => {
    if (!db) return;
    await Promise.all([
        ...createdNames.map(name => db.collection('usernameReservations').doc(name).delete().catch(() => {})),
        ...createdUsers.map(uid => Promise.all([
            db.collection('users').doc(uid).delete().catch(() => {}),
            db.collection('publicProfiles').doc(uid).delete().catch(() => {})
        ])),
        db.collection('system').doc('usernameRegistry').delete().catch(() => {})
    ]);
    if (app) await deleteApp(app);
});

test('Firestore Emulator owner profile callable reads only the authenticated UID', { skip: !available }, async () => {
    const uid = `profile-owner-${token()}`;
    const username = makeUsername();
    await seedProfile({ uid, username });
    const result = await endpoints.getMyProfileV1({ auth: { uid }, data: {} });
    assert.equal(result.profile.username, username);
    assert.equal(result.profile.email, `${uid}@private.example`);
    await assert.rejects(
        endpoints.getMyProfileV1({ auth: { uid }, data: { uid: 'someone-else' } }),
        error => error.code === 'invalid-argument'
    );
});

test('Firestore Emulator profile update refreshes only the public projection', { skip: !available }, async () => {
    const uid = `profile-public-${token()}`;
    const username = makeUsername();
    await seedProfile({ uid, username, visibility: 'public' });
    const result = await endpoints.updateMyProfileV1({
        auth: { uid },
        data: { username, displayName: 'After', bio: 'New bio', location: 'Hamburg' }
    });
    assert.equal(result.publicProfileUpdated, true);
    const [privateSnapshot, publicSnapshot] = await Promise.all([
        db.collection('users').doc(uid).get(),
        db.collection('publicProfiles').doc(uid).get()
    ]);
    assert.equal(privateSnapshot.get('displayName'), 'After');
    assert.equal(privateSnapshot.get('email'), `${uid}@private.example`);
    assert.equal(publicSnapshot.get('displayName'), 'After');
    assert.equal(publicSnapshot.get('bio'), 'New bio');
    assert.equal(publicSnapshot.get('email'), undefined);
    assert.deepEqual(publicSnapshot.get('stats'), { travels: 7 });
});

test('Firestore Emulator username rename atomically moves reservation and public identity', { skip: !available }, async () => {
    const uid = `profile-rename-${token()}`;
    const oldName = makeUsername();
    const newName = makeUsername();
    await seedProfile({ uid, username: oldName, visibility: 'public' });
    createdNames.push(newName);
    const result = await endpoints.updateMyProfileV1({
        auth: { uid },
        data: { username: newName, displayName: 'Renamed', bio: '', location: '' }
    });
    assert.equal(result.username, newName);
    const [oldReservation, newReservation, profile, publicProfile] = await Promise.all([
        db.collection('usernameReservations').doc(oldName.toLowerCase()).get(),
        db.collection('usernameReservations').doc(newName.toLowerCase()).get(),
        db.collection('users').doc(uid).get(),
        db.collection('publicProfiles').doc(uid).get()
    ]);
    assert.equal(oldReservation.exists, false);
    assert.equal(newReservation.get('uid'), uid);
    assert.equal(profile.get('username'), newName);
    assert.equal(publicProfile.get('username'), newName);
});

test('Firestore Emulator rejects username collision without changing the owner profile', { skip: !available }, async () => {
    const uid = `profile-collision-${token()}`;
    const otherUid = `profile-other-${token()}`;
    const oldName = makeUsername();
    const claimedName = makeUsername();
    await seedProfile({ uid, username: oldName });
    await db.collection('usernameReservations').doc(claimedName.toLowerCase()).set({ uid: otherUid });
    createdNames.push(claimedName.toLowerCase());
    await assert.rejects(endpoints.updateMyProfileV1({
        auth: { uid },
        data: { username: claimedName, displayName: 'Changed', bio: '', location: '' }
    }), error => error.code === 'already-exists');
    const profile = await db.collection('users').doc(uid).get();
    assert.equal(profile.get('username'), oldName);
    assert.equal(profile.get('displayName'), 'Before');
});
