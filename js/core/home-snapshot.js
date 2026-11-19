/**
 * UI-only summary; reads existing Firestore profile counters without changing the schema.
 * Treat profile values as untrusted input, even when returned for the signed-in user.
 */
export function safeCount(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return 0;
    return Math.min(999999, Math.floor(number));
}

const NEXT_MILESTONES = [
    { id: 'first_dream', metric: 'dreams', targets: [1, 5], title: 'Мечтатель', icon: 'bi-star', href: '#dreams' },
    { id: 'first_travel', metric: 'travels', targets: [1, 5, 15, 30], title: 'Путешественник', icon: 'bi-airplane', href: '#travels' },
    { id: 'first_book', metric: 'books', targets: [1, 10, 25, 50], title: 'Читатель', icon: 'bi-book', href: '#books' },
    { id: 'first_movie', metric: 'movies', targets: [1, 10, 50, 100], title: 'Киноман', icon: 'bi-film', href: '#movies' },
    { id: 'first_restaurant', metric: 'restaurants', targets: [1, 10, 25], title: 'Гурман', icon: 'bi-shop', href: '#food' },
    { id: 'first_friend', metric: 'friends', targets: [1, 5, 15], title: 'Душа компании', icon: 'bi-people', href: '#friends' }
];

export function getNextHomeAchievement(userData = {}) {
    const stats = userData?.stats || {};
    const earned = Array.isArray(userData?.achievements) ? userData.achievements : [];
    const candidates = NEXT_MILESTONES.flatMap((item) => {
        const level = Math.max(0, safeCount(earned.find(a => a?.id === item.id)?.level));
        const target = item.targets[level];
        if (!target) return [];
        const current = Math.min(target, safeCount(stats[item.metric]));
        return [{ ...item, current, target, percentage: Math.round(current / target * 100) }];
    });
    candidates.sort((a, b) => b.percentage - a.percentage || a.target - b.target);
    return candidates[0] || null;
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
