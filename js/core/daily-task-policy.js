export const DAILY_TASK_CATALOG = Object.freeze([
    { id: 'add_travel', title: 'Добавить путешествие', icon: 'bi-airplane', xp: 80, action: 'travels', target: 1 },
    { id: 'add_restaurant', title: 'Добавить ресторан', icon: 'bi-shop', xp: 60, action: 'restaurants', target: 1 },
    { id: 'add_movie', title: 'Добавить фильм в список', icon: 'bi-film', xp: 50, action: 'movies', target: 1 },
    { id: 'add_book', title: 'Добавить книгу', icon: 'bi-book', xp: 55, action: 'books', target: 1 },
    { id: 'add_dream', title: 'Записать мечту', icon: 'bi-star', xp: 45, action: 'dreams', target: 1 },
    { id: 'add_friend', title: 'Добавить друга', icon: 'bi-person-plus', xp: 100, action: 'friends', target: 1 }
]);

export const DAILY_TASK_BONUS_XP = 100;

function hashSeed(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

export function createDailyTaskSet(uid, dateKey) {
    if (typeof uid !== 'string' || !uid || typeof dateKey !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        throw new TypeError('Invalid daily task assignment identity');
    }
    const pool = DAILY_TASK_CATALOG.map(task => ({ ...task }));
    let seed = hashSeed(uid + ':' + dateKey);
    for (let index = pool.length - 1; index > 0; index--) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const target = seed % (index + 1);
        [pool[index], pool[target]] = [pool[target], pool[index]];
    }
    return pool.slice(0, 3).map(task => ({
        ...task, progress: 0, completed: false, claimed: false, claimedXp: 0
    }));
}

export function isValidDailyTaskId(taskId) {
    return DAILY_TASK_CATALOG.some(task => task.id === taskId);
}
