/**
 * UI-only summary; reads existing Firestore profile counters without changing the schema.
 * Treat profile values as untrusted input, even when returned for the signed-in user.
 */
export function safeCount(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return 0;
    return Math.min(999999, Math.floor(number));
}

export function getHomeSnapshot(userData = {}) {
    const stats = userData?.stats || {};
    const counts = {
        dreams: safeCount(stats.dreams),
        dreamsCompleted: safeCount(stats.dreamsCompleted),
        dreamsInProgress: safeCount(stats.dreamsInProgress),
        travels: safeCount(stats.travels),
        restaurants: safeCount(stats.restaurants),
        movies: safeCount(stats.movies),
        books: safeCount(stats.books),
        friends: safeCount(stats.friends)
    };
    counts.dreamsCompleted = Math.min(counts.dreamsCompleted, counts.dreams);
    counts.dreamsInProgress = Math.min(counts.dreamsInProgress, counts.dreams - counts.dreamsCompleted);

    const starterTasks = ['dreams', 'travels', 'movies', 'books', 'friends'];
    const startedTasks = starterTasks.filter((key) => counts[key] > 0).length;
    return {
        ...counts,
        startedTasks,
        totalTasks: starterTasks.length,
        onboardingPercent: Math.round(startedTasks / starterTasks.length * 100),
        nextAction: counts.dreams === 0
            ? { label: 'Записать первую мечту', href: '#dreams', icon: 'bi-star' }
            : counts.travels === 0
                ? { label: 'Добавить путешествие', href: '#travels', icon: 'bi-airplane' }
                : { label: 'Открыть мои мечты', href: '#dreams', icon: 'bi-arrow-up-right' }
    };
}
