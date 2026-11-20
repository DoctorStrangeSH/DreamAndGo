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
