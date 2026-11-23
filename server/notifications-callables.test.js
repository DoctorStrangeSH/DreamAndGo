import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationCallables } from './notifications-callables.js';

class TestHttpsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function setup(seed = {}) {
    const records = new Map(Object.entries(seed));
    const registrations = [];
    const writes = [];
    const ref = path => ({
        path,
        async get() {
            const value = records.get(path);
            return { exists: value !== undefined, id: path.split('/').at(-1), data: () => value };
        },
        async update(data) {
            if (!records.has(path)) throw new Error('missing');
            records.set(path, { ...records.get(path), ...data });
            writes.push({ type: 'update', path, data });
        }
    });
    const db = {
        collection(name) {
            return {
                doc(id) {
                    const userPath = `${name}/${id}`;
                    return {
                        collection(subcollection) {
                            const collectionPath = `${userPath}/${subcollection}`;
                            return {
                                doc(notificationId) { return ref(`${collectionPath}/${notificationId}`); },
                                orderBy() {
                                    return {
                                        limit(count) {
                                            return {
                                                async get() {
                                                    const docs = [...records.entries()]
                                                        .filter(([path]) => path.startsWith(`${collectionPath}/`))
                                                        .sort((a, b) => {
                                                            const at = a[1].createdAt?.value || 0;
                                                            const bt = b[1].createdAt?.value || 0;
                                                            return bt - at;
                                                        })
                                                        .slice(0, count)
                                                        .map(([path, value]) => ({
                                                            id: path.split('/').at(-1),
                                                            data: () => value
                                                        }));
                                                    return { docs };
                                                }
                                            };
                                        }
                                    };
                                },
                                where(field, operator, value) {
                                    return {
                                        limit(count) {
                                            return {
                                                async get() {
                                                    const docs = [...records.entries()]
                                                        .filter(([path, data]) =>
                                                            path.startsWith(`${collectionPath}/`) &&
                                                            (operator !== '==' || data[field] === value))
                                                        .slice(0, count)
                                                        .map(([path, data]) => ({
                                                            id: path.split('/').at(-1),
                                                            ref: ref(path),
                                                            data: () => data
                                                        }));
                                                    return { docs, empty: docs.length === 0, size: docs.length };
                                                }
                                            };
                                        }
                                    };
                                }
                            };
                        }
                    };
                }
            };
        },
        batch() {
            const pending = [];
            return {
                update(documentRef, data) { pending.push({ path: documentRef.path, data }); },
                async commit() {
                    for (const item of pending) {
                        records.set(item.path, { ...records.get(item.path), ...item.data });
                        writes.push({ type: 'batch-update', ...item });
                    }
                }
            };
        }
    };
    const callables = createNotificationCallables({
        onCall(options, handler) {
            registrations.push({ options, handler });
            return handler;
        },
        HttpsError: TestHttpsError,
        getFirestore: () => db
    });
    return { records, registrations, writes, callables };
}

test('notification callables enforce App Check and fixed region', () => {
    const ctx = setup();
    assert.equal(ctx.registrations.length, 3);
    for (const item of ctx.registrations) {
        assert.deepEqual(item.options, { region: 'europe-west3', enforceAppCheck: true });
    }
});

test('notification list requires authentication and returns only an allowlisted projection', async () => {
    const ctx = setup({
        'users/user-a/notifications/n1': {
            type: 'achievement', title: '🏆 Новое достижение', message: 'Получено',
            icon: 'bi-trophy', color: 'warning', link: '#achievements',
            read: false, createdAt: { toMillis: () => 1234 },
            privatePayload: 'must-not-leak', fromUserId: 'user-b'
        },
        'users/user-b/notifications/n2': {
            title: 'чужое уведомление', message: 'не показывать'
        }
    });
    await assert.rejects(ctx.callables.getMyNotificationsV1({}), error => error.code === 'unauthenticated');
    const result = await ctx.callables.getMyNotificationsV1({ auth: { uid: 'user-a' }, data: {} });
    assert.equal(result.notifications.length, 1);
    assert.deepEqual(result.notifications[0], {
        id: 'n1', type: 'achievement', title: '🏆 Новое достижение',
        message: 'Получено', icon: 'bi-trophy', color: 'warning',
        link: '#achievements', read: false, createdAt: 1234
    });
});

test('notification list rejects caller-selected fields and limits to 30 documents', async () => {
    const ctx = setup();
    await assert.rejects(ctx.callables.getMyNotificationsV1({
        auth: { uid: 'user-a' }, data: { targetUid: 'user-b' }
    }), error => error.code === 'invalid-argument');
    for (let i = 0; i < 35; i++) {
        ctx.records.set(`users/user-a/notifications/n${i}`, { title: `N${i}`, createdAt: { value: i } });
    }
    const result = await ctx.callables.getMyNotificationsV1({ auth: { uid: 'user-a' }, data: {} });
    assert.equal(result.notifications.length, 30);
});

test('mark-read derives owner from auth and accepts only one notification ID', async () => {
    const ctx = setup({ 'users/user-a/notifications/n1': { read: false } });
    await assert.rejects(ctx.callables.markNotificationReadV1({
        data: { notificationId: 'n1' }
    }), error => error.code === 'unauthenticated');
    await assert.rejects(ctx.callables.markNotificationReadV1({
        auth: { uid: 'user-a' }, data: { notificationId: 'n1', uid: 'user-b' }
    }), error => error.code === 'invalid-argument');
    const result = await ctx.callables.markNotificationReadV1({
        auth: { uid: 'user-a' }, data: { notificationId: 'n1' }
    });
    assert.deepEqual(result, { success: true });
    assert.equal(ctx.records.get('users/user-a/notifications/n1').read, true);
    assert.equal(ctx.writes[0].path, 'users/user-a/notifications/n1');
});

test('mark-read cannot access a notification in another account subtree', async () => {
    const ctx = setup({ 'users/user-b/notifications/secret': { read: false } });
    await assert.rejects(ctx.callables.markNotificationReadV1({
        auth: { uid: 'user-a' }, data: { notificationId: 'secret' }
    }), error => error.code === 'not-found');
    assert.equal(ctx.records.get('users/user-b/notifications/secret').read, false);
});

test('mark-all-read changes only unread notifications owned by caller', async () => {
    const ctx = setup({
        'users/user-a/notifications/a': { read: false },
        'users/user-a/notifications/b': { read: true },
        'users/user-b/notifications/c': { read: false }
    });
    const result = await ctx.callables.markAllNotificationsReadV1({
        auth: { uid: 'user-a' }, data: {}
    });
    assert.deepEqual(result, { success: true, updated: 1 });
    assert.equal(ctx.records.get('users/user-a/notifications/a').read, true);
    assert.equal(ctx.records.get('users/user-a/notifications/b').read, true);
    assert.equal(ctx.records.get('users/user-b/notifications/c').read, false);
});

test('mark-all-read rejects arbitrary payload and safely handles empty inbox', async () => {
    const ctx = setup();
    await assert.rejects(ctx.callables.markAllNotificationsReadV1({
        auth: { uid: 'user-a' }, data: { userId: 'user-b' }
    }), error => error.code === 'invalid-argument');
    assert.deepEqual(await ctx.callables.markAllNotificationsReadV1({
        auth: { uid: 'user-a' }, data: {}
    }), { success: true, updated: 0 });
});

test('factory rejects incomplete dependencies', () => {
    assert.throws(() => createNotificationCallables({}), TypeError);
});
