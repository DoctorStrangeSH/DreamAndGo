import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const available = Boolean(emulatorHost);
const projectId = process.env.GCLOUD_PROJECT || 'demo-dream-and-go';
let environment;

before(async () => {
    if (!available) return;
    const [host, port] = emulatorHost.split(':');
    assert.match(emulatorHost, /^(127\.0\.0\.1|localhost):\d+$/);
    const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
    environment = await initializeTestEnvironment({
        projectId,
        firestore: { host, port: Number(port), rules }
    });
});

after(async () => {
    if (environment) await environment.cleanup();
});

test('unauthenticated clients cannot read or write profiles, reservations or registry', { skip: !available }, async () => {
    const db = environment.unauthenticatedContext().firestore();
    for (const path of [
        'users/user-a',
        'usernameReservations/name-a',
        'system/usernameRegistry'
    ]) {
        const reference = doc(db, path);
        await assertFails(getDoc(reference));
        await assertFails(setDoc(reference, { probe: true }));
    }
});

test('authenticated owner and unrelated accounts are denied under the current deny-all policy', { skip: !available }, async () => {
    const ownerDb = environment.authenticatedContext('user-a').firestore();
    const otherDb = environment.authenticatedContext('user-b').firestore();

    await environment.withSecurityRulesDisabled(async context => {
        await setDoc(doc(context.firestore(), 'users/user-a'), {
            email: 'private@example.test',
            username: 'owner'
        });
    });

    await assertFails(getDoc(doc(ownerDb, 'users/user-a')));
    await assertFails(updateDoc(doc(ownerDb, 'users/user-a'), { username: 'changed' }));
    await assertFails(getDoc(doc(otherDb, 'users/user-a')));
    await assertFails(setDoc(doc(otherDb, 'users/user-a'), { hacked: true }));
    await assertFails(deleteDoc(doc(otherDb, 'users/user-a')));
});

test('trusted Admin SDK test context bypasses client rules for server-managed records', { skip: !available }, async () => {
    await environment.withSecurityRulesDisabled(async context => {
        const reference = doc(context.firestore(), 'usernameReservations/server-owned');
        await assertSucceeds(setDoc(reference, { uid: 'server-user' }));
        const snapshot = await getDoc(reference);
        assert.equal(snapshot.get('uid'), 'server-user');
        await assertSucceeds(deleteDoc(reference));
    });
});
