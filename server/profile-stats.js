const COLLECTIONS = {
    travels: {
        total: 'travels',
        statuses: { planned: 'travelsPlanned', visited: 'travelsVisited' }
    },
    restaurants: {
        total: 'restaurants',
        statuses: { visited: 'restaurantsVisited', want_to_visit: 'restaurantsWantToVisit' }
    },
    movies: {
        total: 'movies',
        statuses: { watched: 'moviesWatched', to_watch: 'moviesToWatch' }
    },
    books: {
        total: 'books',
        statuses: { read: 'booksRead', reading: 'booksReading', want_to_read: 'booksWantToRead' }
    },
    dreams: {
        total: 'dreams',
        statuses: { completed: 'dreamsCompleted', in_progress: 'dreamsInProgress', dreaming: null }
    }
};

export function summarizeOwnedCollections(collectionSnapshots) {
    const stats = {};
    for (const [collectionName, config] of Object.entries(COLLECTIONS)) {
        const snapshot = collectionSnapshots?.[collectionName];
        const documents = Array.isArray(snapshot?.docs) ? snapshot.docs : [];
        const records = documents.filter(document => document && document.id !== '_init');
        stats[config.total] = records.length;
        for (const [status, statKey] of Object.entries(config.statuses)) {
            if (!statKey) continue;
            stats[statKey] = records.filter(document => document.data()?.status === status).length;
        }
    }
    return stats;
}

export function mergeOwnedStats(existingStats, calculatedStats) {
    const safeExisting = existingStats && typeof existingStats === 'object' &&
        !Array.isArray(existingStats) ? existingStats : {};
    return { ...safeExisting, ...calculatedStats };
}

export async function refreshUserStatsTransaction(db, uid) {
    if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/')) {
        const error = new TypeError('Invalid authenticated user ID');
        error.code = 'invalid-argument';
        throw error;
    }
    const userRef = db.collection('users').doc(uid);
    return db.runTransaction(async transaction => {
        const names = Object.keys(COLLECTIONS);
        const [profile, ...snapshots] = await Promise.all([
            transaction.get(userRef),
            ...names.map(name => transaction.get(db.collection('users').doc(uid).collection(name)))
        ]);
        if (!profile.exists) {
            const error = new Error('User profile does not exist');
            error.code = 'not-found';
            throw error;
        }
        const collectionSnapshots = Object.fromEntries(
            names.map((name, index) => [name, snapshots[index]])
        );
        const calculated = summarizeOwnedCollections(collectionSnapshots);
        const merged = mergeOwnedStats(profile.get('stats'), calculated);
        transaction.update(userRef, { stats: merged });
        return calculated;
    });
}
