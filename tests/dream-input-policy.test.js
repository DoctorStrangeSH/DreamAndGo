import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDreamInput } from '../js/core/dream-input-policy.js';

const valid = () => ({
    title: '  Выучить язык  ', category: 'Знания', status: 'in_progress',
    description: '  Упражняться каждый день  ', progress: 45,
    deadline: '2027-12-31', steps: [{ text: '  Первый урок  ', done: false }]
});

test('dream input normalizes safe bounded fields', () => {
    assert.deepEqual(validateDreamInput(valid()), {
        title: 'Выучить язык', category: 'Знания', status: 'in_progress',
        description: 'Упражняться каждый день', progress: 45,
        deadline: '2027-12-31', steps: [{ text: 'Первый урок', done: false }]
    });
    assert.equal(validateDreamInput({ title: 'Мечта' }).status, 'dreaming');
});

test('dream input rejects field injection, invalid transitions and oversized content', () => {
    const invalid = [
        { ...valid(), ownerId: 'another' },
        { ...valid(), isAdmin: true },
        { ...valid(), title: 'x'.repeat(121) },
        { ...valid(), description: 'x'.repeat(4001) },
        { ...valid(), status: 'arbitrary' },
        { ...valid(), progress: -1 },
        { ...valid(), progress: 101 },
        { ...valid(), progress: '50' },
        { ...valid(), deadline: '2027-02-31' },
        { ...valid(), deadline: '2027-99-99' },
        { ...valid(), steps: Array.from({ length: 21 }, () => ({ text: 'ok', done: false })) },
        { ...valid(), steps: [{ text: 'ok', done: 'true' }] },
        { ...valid(), steps: [{ text: 'ok', done: false, role: 'admin' }] },
        { ...valid(), steps: [{ text: 'x'.repeat(201), done: false }] }
    ];
    for (const value of invalid) {
        assert.throws(() => validateDreamInput(value), TypeError);
    }
});


test('dream visibility and server timestamps are not client-controlled fields', () => {
    assert.throws(() => validateDreamInput({ ...valid(), isPublic: true }), TypeError);
    assert.throws(() => validateDreamInput({ ...valid(), createdAt: 'client-controlled' }), TypeError);
    assert.throws(() => validateDreamInput({ ...valid(), updatedAt: 'client-controlled' }), TypeError);
});
