import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildChatMigrationBackup,
    encodeFirestoreValue,
    verifyChatMigrationBackup
} from './chat-migration-backup.js';

const sourceManifestSha256 = 'a'.repeat(64);

class GeoPoint {
    constructor(latitude, longitude) {
        this.latitude = latitude;
        this.longitude = longitude;
    }
}

class UnsupportedValue {
    constructor() {
        this.value = 'cannot be serialized losslessly';
    }
}

function validDocuments() {
    return [
        {
            path: 'chats/alice_bob/messages/message-1',
            id: 'message-1',
            data: {
                senderId: 'alice',
                text: 'synthetic private message',
                createdAt: {
                    seconds: 1700000000,
                    nanoseconds: 123000000,
                    toMillis() { return 1700000000123; }
                },
                attachment: Buffer.from([1, 2, 3]),
                location: new GeoPoint(50.1, 8.6),
                sentAtDate: new Date('2026-11-23T10:00:00.000Z')
            }
        },
        {
            path: 'users/alice/chats/bob',
            id: 'bob',
            data: { partnerId: 'bob', unread: 1 }
        }
    ];
}

test('backup builder preserves Firestore value types in tagged JSON form', () => {
    const backup = buildChatMigrationBackup({
        projectId: 'dream-and-go-staging',
        sourceManifestSha256,
        documents: validDocuments()
    });
    const message = backup.records.find(record => record.id === 'message-1');

    assert.deepEqual(message.data.createdAt, {
        __firestoreType: 'timestamp',
        seconds: 1700000000,
        nanoseconds: 123000000
    });
    assert.deepEqual(message.data.attachment, {
        __firestoreType: 'bytes',
        base64: 'AQID'
    });
    assert.deepEqual(message.data.location, {
        __firestoreType: 'geoPoint',
        latitude: 50.1,
        longitude: 8.6
    });
    assert.deepEqual(message.data.sentAtDate, {
        __firestoreType: 'date',
        iso: '2026-11-23T10:00:00.000Z'
    });
});

test('backup is deterministic regardless of source document order and verifies cleanly', () => {
    const first = buildChatMigrationBackup({
        projectId: 'dream-and-go-staging',
        sourceManifestSha256,
        documents: validDocuments()
    });
    const second = buildChatMigrationBackup({
        projectId: 'dream-and-go-staging',
        sourceManifestSha256,
        documents: validDocuments().reverse()
    });

    assert.equal(first.bundleSha256, second.bundleSha256);
    assert.deepEqual(first, second);
    assert.deepEqual(verifyChatMigrationBackup(first), { valid: true, issues: [] });
});

test('backup verifier detects modified message content and invalidates all relevant checksums', () => {
    const backup = buildChatMigrationBackup({
        projectId: 'dream-and-go-staging',
        sourceManifestSha256,
        documents: validDocuments()
    });
    backup.records[0].data.partnerId = 'tampered';

    const verification = verifyChatMigrationBackup(backup);
    assert.equal(verification.valid, false);
    assert.ok(verification.issues.includes(`document-checksum-mismatch:${backup.records[0].path}`));
    assert.ok(verification.issues.includes('bundle-checksum-mismatch'));
});

test('backup builder refuses duplicate paths and mismatched document IDs', () => {
    const document = { path: 'users/alice/chats/bob', id: 'bob', data: { partnerId: 'bob' } };
    assert.throws(() => buildChatMigrationBackup({
        projectId: 'dream-and-go-staging',
        sourceManifestSha256,
        documents: [document, document]
    }), /Повторяющийся путь/);
    assert.throws(() => buildChatMigrationBackup({
        projectId: 'dream-and-go-staging',
        sourceManifestSha256,
        documents: [{ ...document, id: 'mallory' }]
    }), /ID документа не совпадает/);
});

test('backup builder rejects malformed source manifest hashes and production-like project IDs are not inferred', () => {
    assert.throws(() => buildChatMigrationBackup({
        projectId: 'dream-and-go-staging',
        sourceManifestSha256: 'not-a-hash',
        documents: []
    }), /SHA-256/);
    assert.throws(() => buildChatMigrationBackup({
        projectId: 'dream-and-go-staging',
        sourceManifestSha256,
        documents: [{ path: 'users/alice/chats', data: {} }]
    }), /чётное число сегментов/);
});

test('unknown Firestore value types fail closed instead of being silently omitted', () => {
    assert.throws(() => encodeFirestoreValue(new UnsupportedValue()), /Неподдерживаемый тип объекта/);
    assert.throws(() => encodeFirestoreValue({ optional: undefined }), /Неподдерживаемое значение/);
    assert.throws(() => encodeFirestoreValue(Number.NaN), /Неконечное число/);
});
