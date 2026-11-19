import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalMessageJson, compareMessageInventories } from '../server/chat-integrity.js';

const message = (id, text = 'Привет', extra = {}) => ({
    id, data: {
        senderId: 'alice', text,
        createdAt: { seconds: 1710000000, nanoseconds: 123456789 },
        edited: false, read: false, ...extra
    }
});

test('identical messages compare regardless of object key and array order', () => {
    const original = [message('m2', 'Второе'), message('m1')];
    const reordered = [
        { id: 'm1', data: { read: false, text: 'Привет', edited: false, createdAt: {
            nanoseconds: 123456789, seconds: 1710000000
        }, senderId: 'alice' } },
        message('m2', 'Второе')
    ];
    const result = compareMessageInventories(original, reordered);
    assert.equal(result.equal, true);
    assert.equal(result.sourceDigest, result.targetDigest);
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.changed, []);
    assert.deepEqual(result.extra, []);
});

test('reports missing, extra and modified messages by ID without their text', () => {
    const result = compareMessageInventories(
        [message('m1', 'Тайна'), message('m2', 'Не менять')],
        [message('m1', 'Изменено'), message('m3', 'Лишнее')]
    );
    assert.equal(result.equal, false);
    assert.deepEqual(result.changed, ['m1']);
    assert.deepEqual(result.missing, ['m2']);
    assert.deepEqual(result.extra, ['m3']);
    assert.equal(JSON.stringify(result).includes('Тайна'), false);
    assert.equal(JSON.stringify(result).includes('Изменено'), false);
});

test('detects altered sender, timestamp, read flags and extra fields', () => {
    const base = [message('m1')];
    const variants = [
        [message('m1', 'Привет', { senderId: 'bob' })],
        [message('m1', 'Привет', { createdAt: { seconds: 1710000001, nanoseconds: 123456789 } })],
        [message('m1', 'Привет', { read: true })],
        [message('m1', 'Привет', { unexpected: 'extra' })]
    ];
    for (const changed of variants) {
        assert.deepEqual(compareMessageInventories(base, changed).changed, ['m1']);
    }
});

test('rejects duplicates and malformed documents rather than silently dropping them', () => {
    const duplicate = compareMessageInventories([message('m1'), message('m1')], [message('m1')]);
    assert.equal(duplicate.equal, false);
    assert.ok(duplicate.sourceIssues.some(issue => issue.code === 'invalid_or_duplicate_message_id'));
    const invalid = compareMessageInventories([message('m1')], [{ id: 'm1', data: { text: 'No sender' } }]);
    assert.equal(invalid.equal, false);
    assert.ok(invalid.targetIssues.some(issue => issue.code === 'invalid_message_shape'));
});

test('canonicalizer fails closed on unsupported values and sparse arrays', () => {
    assert.throws(() => canonicalMessageJson({ nested: undefined }), TypeError);
    assert.throws(() => canonicalMessageJson({ n: Infinity }), TypeError);
    assert.throws(() => canonicalMessageJson([, 1]), TypeError);
    assert.throws(() => canonicalMessageJson(new Date()), TypeError);
});
