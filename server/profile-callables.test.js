import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileCallables } from './profile-callables.js';

class TestHttpsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

const validVisibility = {
    profile: 'public',
    travels: 'public',
    food: 'private',
    movies: 'public',
    books: 'private',
    dreams: 'private'
};

function setup({ profile, commitError } = {}) {
    const registrations = [];
    const writes = [];
    const userRef = { path: 'users/user-1' };
    const publicRef = { path: 'publicProfiles/user-1' };
    const batch = {
        update(ref, data) { writes.push({ operation: 'update', path: ref.path, data }); },
        set(ref, data) { writes.push({ operation: 'set', path: ref.path, data }); },
        delete(ref) { writes.push({ operation: 'delete', path: ref.path }); },
        async commit() {
            writes.push({ operation: 'commit' });
            if (commitError) throw commitError;
        }
    };
    const db = {
        collection(name) {
            return {
                doc(uid) {
                    assert.equal(uid, 'user-1');
                    return name === 'users' ? {
                        ...userRef,
                        async get() {
                            return {
                                exists: profile !== undefined,
                                data: () => profile
                            };
                        }
                    } : publicRef;
                }
            };
        },
        batch: () => batch
    };
    const dependencies = {
        onCall(options, handler) {
            registrations.push({ options, handler });
            return handler;
        },
        HttpsError: TestHttpsError,
        getFirestore: () => db,
        FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
        buildPublicProfile: (uid, data) => {
            assert.equal(uid, 'user-1');
            if (data.privacy.profile !== 'public') return null;
            return {
                uid,
                username: data.username,
                stats: data.privacy.travels === 'public' ? { travels: data.stats?.travels ?? 0 } : {}
            };
        }
    };
    return {
        registrations,
        writes,
        dependencies,
        handler: () => createProfileCallables(dependencies).updateProfileVisibilityV1
    };
}

test('visibility callable enforces App Check in the fixed Functions region', () => {
    const { registrations, dependencies } = setup({ profile: { username: 'dreamer' } });
    createProfileCallables(dependencies);
    assert.deepEqual(registrations[0].options, {
        region: 'europe-west3',
        enforceAppCheck: true
    });
});

test('visibility update requires authenticated UID before database access', async () => {
    let databaseCalls = 0;
    const { dependencies } = setup({ profile: { username: 'dreamer' } });
    dependencies.getFirestore = () => {
        databaseCalls += 1;
        throw new Error('must not be called');
    };
    const callable = createProfileCallables(dependencies).updateProfileVisibilityV1;
    await assert.rejects(callable({ data: { visibility: validVisibility } }), error => {
        assert.equal(error.code, 'unauthenticated');
        return true;
    });
    assert.equal(databaseCalls, 0);
});

test('visibility update rejects malformed UIDs and caller-selected document paths', async () => {
    const { handler } = setup({ profile: { username: 'dreamer' } });
    const callable = handler();
    for (const uid of ['../other', '']) {
        await assert.rejects(callable({
            auth: { uid },
            data: { visibility: validVisibility }
        }), error => error.code === 'unauthenticated');
    }
});

test('visibility update requires the complete allowlisted preference set', async () => {
    const { handler } = setup({ profile: { username: 'dreamer' } });
    const callable = handler();
    for (const data of [
        {},
        { visibility: { profile: 'public' } },
        { visibility: { ...validVisibility, email: 'public' } },
        { visibility: { ...validVisibility, travels: 'everyone' } },
        { visibility: validVisibility, uid: 'someone-else' }
    ]) {
        await assert.rejects(callable({ auth: { uid: 'user-1' }, data }), error =>
            error.code === 'invalid-argument');
    }
});

test('explicit public consent atomically updates private preferences and publishes an allowlisted projection', async () => {
    const { handler, writes } = setup({
        profile: {
            username: 'dreamer',
            email: 'private@example.test',
            lastLogin: 'private',
            stats: { travels: 5 },
            friends: ['secret-user']
        }
    });
    const callable = handler();
    const result = await callable({
        auth: { uid: 'user-1' },
        data: { visibility: validVisibility }
    });

    assert.deepEqual(result, {
        profileVisibility: 'public',
        publicProfilePublished: true
    });
    assert.deepEqual(writes[0], {
        operation: 'update',
        path: 'users/user-1',
        data: { privacy: validVisibility, privacyUpdatedAt: 'SERVER_TIMESTAMP' }
    });
    assert.equal(writes[1].operation, 'set');
    assert.equal(writes[1].path, 'publicProfiles/user-1');
    assert.deepEqual(writes[1].data, {
        uid: 'user-1',
        username: 'dreamer',
        stats: { travels: 5 },
        updatedAt: 'SERVER_TIMESTAMP'
    });
    assert.equal(writes.at(-1).operation, 'commit');
});

test('private profile removes any existing public projection atomically', async () => {
    const { handler, writes } = setup({ profile: { username: 'dreamer' } });
    const callable = handler();
    const result = await callable({
        auth: { uid: 'user-1' },
        data: {
            visibility: {
                ...validVisibility,
                profile: 'private'
            }
        }
    });
    assert.deepEqual(result, {
        profileVisibility: 'private',
        publicProfilePublished: false
    });
    assert.equal(writes[1].operation, 'delete');
    assert.equal(writes[1].path, 'publicProfiles/user-1');
});

test('visibility update refuses to create a projection for a missing profile', async () => {
    const { handler, writes } = setup();
    await assert.rejects(handler()({
        auth: { uid: 'user-1' },
        data: { visibility: validVisibility }
    }), error => error.code === 'failed-precondition');
    assert.equal(writes.length, 0);
});

test('visibility update maps storage failures to generic errors and does not leak internals', async () => {
    const { dependencies } = setup({
        profile: { username: 'dreamer' },
        commitError: new Error('sensitive database detail')
    });
    const callable = createProfileCallables(dependencies).updateProfileVisibilityV1;
    await assert.rejects(callable({
        auth: { uid: 'user-1' },
        data: { visibility: validVisibility }
    }), error => {
        assert.equal(error.code, 'unavailable');
        assert.equal(error.message.includes('sensitive'), false);
        return true;
    });
});

test('factory rejects incomplete dependencies', () => {
    assert.throws(() => createProfileCallables({}), TypeError);
});
