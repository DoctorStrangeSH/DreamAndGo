import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint, Bytes } from 'firebase-admin/firestore';
import {
    buildChatMigrationBackup,
    decodeFirestoreValue,
    verifyChatMigrationBackup
} from './chat-migration-backup.js';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const available = Boolean(emulatorHost);
const projectId = process.env.GCLOUD_PROJECT || 'demo-dream-and-go';
let app;
let db;

before(async () => {
    if (!available) return;
    app = initializeApp({ projectId }, `chat-backup-restore-emulator-${process.pid}`);
    db = getFirestore(app);
});

after(async () => {
    if (app) await deleteApp(app);
});

test('Firestore Emulator restores a JSON backup with nested paths and native Firestore value types', { skip: !available }, async () => {
    const runId = randomUUID().replaceAll('-', '');
    const sourceRoot = db.collection('backupSourceRuns').doc(runId);
    const restoreRoot = db.collection('backupRestoreRuns').doc(runId);
    try {
        const profileRef = sourceRoot.collection('profiles').doc('alice');
        const messageRef = sourceRoot.collection('messages').doc('message-1');
        await sourceRoot.set({
            ownerUid: 'alice',
            createdAt: new Timestamp(1700000000, 123456789),
            location: new GeoPoint(50.1109, 8.6821),
            attachment: Bytes.fromUint8Array(Uint8Array.from([1, 2, 3, 254])),
            profileRef
        });
        await profileRef.set({ displayName: 'Synthetic Alice' });
        await messageRef.set({
            senderId: 'alice',
            text: 'synthetic emulator restore fixture',
            sentAt: new Date('2026-11-23T10:00:00.000Z'),
            edited: false
        });

        const sourceRefs = [sourceRoot, profileRef, messageRef];
        const documents = [];
        for (const ref of sourceRefs) {
            const snapshot = await ref.get();
            documents.push({ path: ref.path, id: ref.id, data: snapshot.data() });
        }

        const backup = buildChatMigrationBackup({
            projectId,
            sourceManifestSha256: 'a'.repeat(64),
            documents
        });
        const serialized = JSON.stringify(backup);
        const readBack = JSON.parse(serialized);
        assert.deepEqual(verifyChatMigrationBackup(readBack), { valid: true, issues: [] });

        for (const record of readBack.records) {
            const restoredData = decodeFirestoreValue(record.data, {
                firestore: db,
                Timestamp,
                GeoPoint,
                Bytes
            });
            const targetRef = restoreRoot.collection('documents').doc(record.id + '-' +
                record.sourceSha256.slice(0, 12));
            await targetRef.set(restoredData);
        }

        const restoredRoot = await restoreRoot.collection('documents')
            .doc(sourceRoot.id + '-' + readBack.records.find(record => record.path === sourceRoot.path).sourceSha256.slice(0, 12))
            .get();
        assert.equal(restoredRoot.get('ownerUid'), 'alice');
        assert.equal(restoredRoot.get('createdAt').isEqual(new Timestamp(1700000000, 123456789)), true);
        assert.equal(restoredRoot.get('location').latitude, 50.1109);
        assert.deepEqual([...restoredRoot.get('attachment').toUint8Array()], [1, 2, 3, 254]);
        assert.equal(restoredRoot.get('profileRef').path, profileRef.path);

        const restoredMessageRecord = readBack.records.find(record => record.path === messageRef.path);
        const restoredMessage = await restoreRoot.collection('documents')
            .doc(restoredMessageRecord.id + '-' + restoredMessageRecord.sourceSha256.slice(0, 12)).get();
        assert.equal(restoredMessage.get('text'), 'synthetic emulator restore fixture');
        assert.equal(restoredMessage.get('sentAt').toMillis(), Date.parse('2026-11-23T10:00:00.000Z'));
        assert.equal(restoredMessage.get('edited'), false);

        const restoredProfileRecord = readBack.records.find(record => record.path === profileRef.path);
        const restoredProfile = await restoreRoot.collection('documents')
            .doc(restoredProfileRecord.id + '-' + restoredProfileRecord.sourceSha256.slice(0, 12)).get();
        assert.equal(restoredProfile.get('displayName'), 'Synthetic Alice');
        assert.equal(readBack.manifest.documentCount, 3);
        assert.equal((await restoreRoot.collection('documents').get()).size, 3);
    } finally {
        await Promise.all([
            db.recursiveDelete(sourceRoot).catch(() => {}),
            db.recursiveDelete(restoreRoot).catch(() => {})
        ]);
    }
});
