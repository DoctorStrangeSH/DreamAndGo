const REGION = 'europe-west3';
const MAX_RESULTS = 100;
const LOOKAHEAD_LIMIT = MAX_RESULTS + 1;
const LISTS = Object.freeze({
    friends: { collection: 'friends', timestamp: 'addedAt', outputTimestamp: 'addedAt' },
    requests: { collection: 'friendRequests', timestamp: 'createdAt', outputTimestamp: 'createdAt' },
    sent: { collection: 'sentRequests', timestamp: 'createdAt', outputTimestamp: 'createdAt' }
});

function requireOwner(request, HttpsError) {
    const uid = request.auth?.uid;
    if (typeof uid !== 'string' || uid.length === 0 || uid.length > 128 || uid.includes('/')) {
        throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    }
    if (request.data && (typeof request.data !== 'object' || Array.isArray(request.data) ||
        Object.keys(request.data).length !== 0)) {
        throw new HttpsError('invalid-argument', 'Операция не принимает параметры');
    }
    return uid;
}

function timestampToIso(value) {
    const date = value?.toDate?.() || (value instanceof Date ? value : null);
    return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function createFriendReadCallables({ onCall, HttpsError, getFirestore }) {
    if (typeof onCall !== 'function' || typeof HttpsError !== 'function' ||
        typeof getFirestore !== 'function') {
        throw new TypeError('Некорректная конфигурация чтения списка друзей');
    }

    const options = { region: REGION, enforceAppCheck: true };

    async function listForOwner(request, listType) {
        const uid = requireOwner(request, HttpsError);
        const config = LISTS[listType];
        const db = getFirestore();

        try {
            const snapshot = await db.collection('users').doc(uid)
                .collection(config.collection).limit(LOOKAHEAD_LIMIT).get();

            const allRecords = snapshot.docs.filter(item => item.id !== '_init');
            const records = allRecords.slice(0, MAX_RESULTS);
            const rows = await Promise.all(records.map(async item => {
                const profile = await db.collection('publicProfiles').doc(item.id).get();
                if (!profile.exists) return null;

                const data = profile.data() || {};
                const relation = item.data() || {};
                const username = typeof data.username === 'string' ? data.username : '';
                const displayName = typeof data.displayName === 'string' && data.displayName
                    ? data.displayName : username;

                return {
                    uid: item.id,
                    username,
                    displayName,
                    avatar: typeof data.avatar === 'string' ? data.avatar : null,
                    bio: typeof data.bio === 'string' ? data.bio : '',
                    stats: data.stats && typeof data.stats === 'object' && !Array.isArray(data.stats)
                        ? { travels: Number(data.stats.travels) || 0, movies: Number(data.stats.movies) || 0, books: Number(data.stats.books) || 0 }
                        : {},
                    [config.outputTimestamp]: timestampToIso(relation[config.timestamp])
                };
            }));

            return { success: true, items: rows.filter(Boolean), truncated: allRecords.length > MAX_RESULTS };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('unavailable', 'Не удалось загрузить список. Попробуй позже.');
        }
    }

    const getMyFriendsV1 = onCall(options, request => listForOwner(request, 'friends'));
    const getMyFriendRequestsV1 = onCall(options, request => listForOwner(request, 'requests'));
    const getMySentFriendRequestsV1 = onCall(options, request => listForOwner(request, 'sent'));

    return Object.freeze({ getMyFriendsV1, getMyFriendRequestsV1, getMySentFriendRequestsV1 });
}

export { createFriendReadCallables };
