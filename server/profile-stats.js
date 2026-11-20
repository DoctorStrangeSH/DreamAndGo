import { calculateAchievementAwards } from '../js/core/achievement-award-policy.js';
import { ACHIEVEMENTS } from '../js/core/achievement-catalog.js';

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
    },
    friends: { total: 'friends', statuses: {} }
};

const WEEKLY_ACTIVITY_ACTIONS = new Set(['travels', 'restaurants', 'movies', 'books', 'dreams']);

export function countWeeklyCollectionEvents(snapshot, now = new Date()) {
    const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const docs = Array.isArray(snapshot?.docs) ? snapshot.docs : [];
    return docs.filter(document => {
        const data = document?.data?.() || {};
        if (!WEEKLY_ACTIVITY_ACTIONS.has(data.action) || data.xpGained <= 0) return false;
        const occurredAt = data.occurredAt?.toDate?.() || data.occurredAt;
        const timestamp = occurredAt instanceof Date ? occurredAt.getTime() : Date.parse(occurredAt);
        return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= now.getTime();
    }).length;
}

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
        const activityCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const activityQuery = userRef.collection('xpEvents').where('occurredAt', '>=', activityCutoff);
        const [profile, ...snapshotsAndActivity] = await Promise.all([
            transaction.get(userRef),
            ...names.map(name => transaction.get(db.collection('users').doc(uid).collection(name))),
            transaction.get(activityQuery)
        ]);
        const activitySnapshot = snapshotsAndActivity.pop();
        if (!profile.exists) {
            const error = new Error('User profile does not exist');
            error.code = 'not-found';
            throw error;
        }
        const collectionSnapshots = Object.fromEntries(
            names.map((name, index) => [name, snapshots[index]])
        );
        const calculated = {
            ...summarizeOwnedCollections(collectionSnapshots),
            weeklyActivityCount: countWeeklyCollectionEvents(activitySnapshot)
        };
        const merged = mergeOwnedStats(profile.get('stats'), calculated);
        const achievementResult = calculateAchievementAwards(
            calculated,
            profile.get('achievements') || [],
            ACHIEVEMENTS,
            new Date().toISOString()
        );
        const update = { stats: merged };
        if (achievementResult.newAchievements.length > 0) {
            update.achievements = achievementResult.updatedAchievements;
        }
        transaction.update(userRef, update);
        return { ...calculated, newAchievements: achievementResult.newAchievements };
    });
}
