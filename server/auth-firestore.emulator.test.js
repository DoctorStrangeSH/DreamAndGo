import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth, verifyIdToken } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createRegistrationCallables } from './registration-callables.js';
import { registerProfileWithReservedUsername } from './username-reservation.js';
import { getRegistrationState } from './registration-state.js';

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.GCLOUD_PROJECT || 'demo-dream-and-go';
const available = Boolean(authHost && firestoreHost);
const accounts = [];
let app;
let auth;
let db;
let registerProfileV2;
let getRegistrationStateV2;

class EmulatorHttpsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function uniquePart() {
    return randomBytes(7).toString('hex');
}

async function createEmulatorAccount() {
    const email = `signup-${uniquePart()}@example.test`;
    const password = 'Test-only-Password-2026!';
    const response = await fetch(
        `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-api-key`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true })
        }
    );
    const body = await response.json();
    assert.equal(response.ok, true, JSON.stringify(body));
    accounts.push(body.localId);
    return { email, uid: body.localId, idToken: body.idToken };
}

before(async () => {
    if (!available) return;
    assert.match(authHost, /^(127\.0\.0\.1|localhost):\d+$/);
    assert.match(firestoreHost, /^(127\.0\.0\.1|localhost):\d+$/);
    app = initializeApp({ projectId }, `auth-firestore-integration-${process.pid}`);
    auth = getAuth(app);
    db = getFirestore(app);

    const [host, port] = firestoreHost.split(':');
    // Admin SDK reads FIRESTORE_EMULATOR_HOST automatically.
    assert.ok(host && Number(port) > 0);

    await db.collection('system').doc('usernameRegistry').set({
        ready: true,
        schemaVersion: 1,
        legacyBackfillComplete: true
    });

    const endpoints = [];
    const callables = createRegistrationCallables({
        onCall(options, handler) {
            endpoints.push({ options, handler });
            return handler;
        },
        HttpsError: EmulatorHttpsError,
        getAuth: () => auth,
        getFirestore: () => db,
        FieldValue,
        registerProfileWithReservedUsername,
        getRegistrationState
    });
    ({ registerProfileV2, getRegistrationStateV2 } = callables);
    assert.equal(endpoints.length, 2);
    assert.ok(endpoints.every(endpoint => endpoint.options.enforceAppCheck === true));
    assert.ok(endpoints.every(endpoint => endpoint.options.region === 'europe-west3'));
});

after(async () => {
    if (!app) return;
    await Promise.all(accounts.map(uid => auth.deleteUser(uid).catch(() => {})));
    await db.collection('system').doc('usernameRegistry').delete().catch(() => {});
    await deleteApp(app);
});

test('Auth Emulator identity is verified and callable creates profile using trusted Auth email', { skip: !available }, async () => {
    const account = await createEmulatorAccount();
    const decoded = await auth.verifyIdToken(account.idToken);
    assert.equal(decoded.uid, account.uid);

    const storedAccount = await auth.getUser(account.uid);
    assert.equal(storedAccount.email, account.email);
    assert.equal(storedAccount.disabled, false);

    const username = `em${uniquePart()}`.slice(0, 20);
    const result = await registerProfileV2({
        auth: { uid: account.uid },
        data: { username, email: 'forged@example.test' }
    });

    assert.deepEqual(result, { username, recovered: false });
    const profile = await db.collection('users').doc(account.uid).get();
    assert.equal(profile.get('email'), account.email);
    assert.notEqual(profile.get('email'), 'forged@example.test');
    assert.equal(profile.get('usernameNormalized'), username.toLowerCase());
});

test('two Auth Emulator accounts cannot claim the same username', { skip: !available }, async () => {
    const first = await createEmulatorAccount();
    const second = await createEmulatorAccount();
    const username = `du${uniquePart()}`.slice(0, 20);

    const results = await Promise.allSettled([
        registerProfileV2({ auth: { uid: first.uid }, data: { username } }),
        registerProfileV2({ auth: { uid: second.uid }, data: { username } })
    ]);

    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = results.find(result => result.status === 'rejected');
    assert.equal(rejected.reason.code, 'already-exists');
});

test('registration recovery callable reports only the current account state', { skip: !available }, async () => {
    const account = await createEmulatorAccount();
    assert.deepEqual(await getRegistrationStateV2({ auth: { uid: account.uid } }), {
        status: 'needs-profile'
    });

    const username = `rc${uniquePart()}`.slice(0, 20);
    await registerProfileV2({ auth: { uid: account.uid }, data: { username } });
    assert.deepEqual(await getRegistrationStateV2({ auth: { uid: account.uid } }), {
        status: 'complete'
    });

    await assert.rejects(
        getRegistrationStateV2({}),
        error => error.code === 'unauthenticated'
    );
});
