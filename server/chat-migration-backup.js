import { createHash } from 'node:crypto';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function stableJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function hash(value) {
    return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
}

function assertDocumentPath(path) {
    if (typeof path !== 'string' || !path || path.startsWith('/') || path.endsWith('/')) {
        throw new TypeError('Некорректный Firestore document path');
    }
    const parts = path.split('/');
    if (parts.length % 2 !== 0 || parts.some(part => !part || part === '.' || part === '..')) {
        throw new TypeError('Путь документа Firestore должен содержать чётное число сегментов');
    }
    return parts.at(-1);
}

/**
 * Encode Firestore Admin SDK values into a lossless, JSON-safe tagged representation.
 * Unknown object types fail closed instead of silently dropping fields.
 */
export function encodeFirestoreValue(value, location = 'document.data') {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new TypeError(`Неконечное число: ${location}`);
        return value;
    }
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
        throw new TypeError(`Неподдерживаемое значение: ${location}`);
    }
    if (value instanceof Date) {
        if (!Number.isFinite(value.getTime())) throw new TypeError(`Некорректная дата: ${location}`);
        return { __firestoreType: 'date', iso: value.toISOString() };
    }
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
        return { __firestoreType: 'bytes', base64: Buffer.from(value).toString('base64') };
    }
    if (Array.isArray(value)) {
        return value.map((item, index) => encodeFirestoreValue(item, `${location}[${index}]`));
    }
    if (typeof value.toMillis === 'function' &&
        Number.isSafeInteger(value.seconds) &&
        Number.isSafeInteger(value.nanoseconds)) {
        return {
            __firestoreType: 'timestamp',
            seconds: value.seconds,
            nanoseconds: value.nanoseconds
        };
    }
    if (typeof value.toUint8Array === 'function') {
        return {
            __firestoreType: 'bytes',
            base64: Buffer.from(value.toUint8Array()).toString('base64')
        };
    }
    if (typeof value.latitude === 'number' && typeof value.longitude === 'number' &&
        value.constructor?.name === 'GeoPoint') {
        return {
            __firestoreType: 'geoPoint',
            latitude: value.latitude,
            longitude: value.longitude
        };
    }
    if (typeof value.path === 'string' && value.firestore && typeof value.get === 'function') {
        return { __firestoreType: 'documentReference', path: value.path };
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`Неподдерживаемый тип объекта ${value.constructor?.name || 'unknown'}: ${location}`);
    }
    if (Object.hasOwn(value, '__firestoreType')) {
        throw new TypeError(`Зарезервированное поле __firestoreType: ${location}`);
    }
    const output = {};
    for (const key of Object.keys(value).sort()) {
        output[key] = encodeFirestoreValue(value[key], `${location}.${key}`);
    }
    return output;
}


/**
 * Rehydrate tagged values for a controlled restore into a Firestore database.
 * Constructors are injected so the pure backup module does not initialize Firebase.
 */
function assertTaggedValueKeys(value, expectedKeys, location) {
    const actual = Object.keys(value).sort();
    const expected = [...expectedKeys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
        throw new TypeError(`Некорректная структура Firestore tag: ${location}`);
    }
}

export function decodeFirestoreValue(value, { firestore, Timestamp, GeoPoint, Bytes } = {}, location = 'document.data') {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
        return value.map((item, index) => decodeFirestoreValue(item, { firestore, Timestamp, GeoPoint, Bytes }, `${location}[${index}]`));
    }

    if (Object.hasOwn(value, '__firestoreType')) {
        const type = value.__firestoreType;
        if (type === 'timestamp') {
            assertTaggedValueKeys(value, ['__firestoreType', 'seconds', 'nanoseconds'], location);
            if (!Number.isSafeInteger(value.seconds) || !Number.isSafeInteger(value.nanoseconds) ||
                value.nanoseconds < 0 || value.nanoseconds >= 1_000_000_000 || typeof Timestamp !== 'function') {
                throw new TypeError(`Некорректный Timestamp: ${location}`);
            }
            return new Timestamp(value.seconds, value.nanoseconds);
        }
        if (type === 'date') {
            assertTaggedValueKeys(value, ['__firestoreType', 'iso'], location);
            if (typeof value.iso !== 'string' || !Number.isFinite(Date.parse(value.iso)) ||
                new Date(value.iso).toISOString() !== value.iso) {
                throw new TypeError(`Некорректная Date: ${location}`);
            }
            return new Date(value.iso);
        }
        if (type === 'bytes') {
            assertTaggedValueKeys(value, ['__firestoreType', 'base64'], location);
            if (typeof value.base64 !== 'string' ||
                Buffer.from(value.base64, 'base64').toString('base64') !== value.base64 ||
                !Bytes || typeof Bytes.fromBase64String !== 'function') {
                throw new TypeError(`Некорректные Bytes: ${location}`);
            }
            return Bytes.fromBase64String(value.base64);
        }
        if (type === 'geoPoint') {
            assertTaggedValueKeys(value, ['__firestoreType', 'latitude', 'longitude'], location);
            if (!Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) ||
                value.latitude < -90 || value.latitude > 90 ||
                value.longitude < -180 || value.longitude > 180 ||
                typeof GeoPoint !== 'function') {
                throw new TypeError(`Некорректный GeoPoint: ${location}`);
            }
            return new GeoPoint(value.latitude, value.longitude);
        }
        if (type === 'documentReference') {
            assertTaggedValueKeys(value, ['__firestoreType', 'path'], location);
            assertDocumentPath(value.path);
            if (!firestore || typeof firestore.doc !== 'function') {
                throw new TypeError(`Для DocumentReference требуется Firestore: ${location}`);
            }
            return firestore.doc(value.path);
        }
        throw new TypeError(`Неизвестный Firestore tag: ${location}`);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`Неподдерживаемый объект в backup: ${location}`);
    }
    const output = {};
    for (const key of Object.keys(value).sort()) {
        output[key] = decodeFirestoreValue(value[key], { firestore, Timestamp, GeoPoint, Bytes }, `${location}.${key}`);
    }
    return output;
}

export function buildChatMigrationBackup({ projectId, sourceManifestSha256, documents }) {
    if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
        throw new TypeError('Некорректный Firebase project ID');
    }
    if (typeof sourceManifestSha256 !== 'string' || !SHA256_PATTERN.test(sourceManifestSha256)) {
        throw new TypeError('Требуется SHA-256 исходного inventory manifest');
    }
    if (!Array.isArray(documents)) throw new TypeError('documents должен быть массивом');

    const seenPaths = new Set();
    const records = documents.map(document => {
        const id = assertDocumentPath(document?.path);
        if (seenPaths.has(document.path)) throw new Error(`Повторяющийся путь документа: ${document.path}`);
        seenPaths.add(document.path);
        if (document.id !== undefined && document.id !== id) {
            throw new Error(`ID документа не совпадает с путём: ${document.path}`);
        }
        if (!document.data || typeof document.data !== 'object' || Array.isArray(document.data)) {
            throw new TypeError(`Некорректные данные документа: ${document.path}`);
        }
        const data = encodeFirestoreValue(document.data, document.path);
        const content = { path: document.path, id, data };
        const canonical = stableJson(content);
        return {
            ...content,
            sourceSha256: hash(canonical),
            sourceBytes: Buffer.byteLength(canonical, 'utf8')
        };
    }).sort((a, b) => a.path.localeCompare(b.path));

    const manifest = {
        schemaVersion: 1,
        format: 'dreamandgo-firestore-chat-backup',
        projectId,
        sourceManifestSha256,
        documentCount: records.length,
        totalSourceBytes: records.reduce((sum, record) => sum + record.sourceBytes, 0),
        records: records.map(({ path, id, sourceSha256, sourceBytes }) => ({
            path, id, sourceSha256, sourceBytes
        }))
    };
    const bundle = { manifest, records };
    return {
        ...bundle,
        manifestSha256: hash(manifest),
        bundleSha256: hash(bundle)
    };
}

export function verifyChatMigrationBackup(backup) {
    const issues = [];
    if (!backup || backup.manifest?.schemaVersion !== 1 ||
        backup.manifest?.format !== 'dreamandgo-firestore-chat-backup' ||
        !Array.isArray(backup.records)) {
        return { valid: false, issues: ['invalid-backup-envelope'] };
    }
    const seenPaths = new Set();
    const expectedRecords = [];
    for (const record of backup.records) {
        try {
            const id = assertDocumentPath(record.path);
            if (record.id !== id) issues.push(`document-id-path-mismatch:${record.path}`);
            if (seenPaths.has(record.path)) issues.push(`duplicate-document-path:${record.path}`);
            seenPaths.add(record.path);
            const content = { path: record.path, id: record.id, data: record.data };
            const canonical = stableJson(content);
            const actualHash = hash(canonical);
            const actualBytes = Buffer.byteLength(canonical, 'utf8');
            if (record.sourceSha256 !== actualHash) issues.push(`document-checksum-mismatch:${record.path}`);
            if (record.sourceBytes !== actualBytes) issues.push(`document-size-mismatch:${record.path}`);
            expectedRecords.push({
                path: record.path,
                id: record.id,
                sourceSha256: record.sourceSha256,
                sourceBytes: record.sourceBytes
            });
        } catch {
            issues.push('invalid-document-record');
        }
    }
    expectedRecords.sort((a, b) => a.path.localeCompare(b.path));
    if (backup.manifest.documentCount !== backup.records.length) issues.push('document-count-mismatch');
    if (backup.manifest.totalSourceBytes !== backup.records.reduce((sum, record) => sum + (Number.isSafeInteger(record?.sourceBytes) ? record.sourceBytes : 0), 0)) {
        issues.push('total-source-bytes-mismatch');
    }
    if (!Array.isArray(backup.manifest.records) ||
        stableJson(backup.manifest.records) !== stableJson(expectedRecords)) issues.push('manifest-records-mismatch');
    const manifestHash = hash(backup.manifest);
    if (backup.manifestSha256 !== manifestHash) issues.push('manifest-checksum-mismatch');
    const bundleHash = hash({ manifest: backup.manifest, records: backup.records });
    if (backup.bundleSha256 !== bundleHash) issues.push('bundle-checksum-mismatch');
    return { valid: issues.length === 0, issues: [...new Set(issues)].sort() };
}
