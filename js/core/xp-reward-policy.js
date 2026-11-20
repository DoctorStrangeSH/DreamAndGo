export const XP_REWARDS = Object.freeze({
    travels: 50,
    restaurants: 30,
    movies: 20,
    books: 25,
    dreams: 15,
    friends: 40,
    complete_dream: 100
});

export const XP_DAILY_LIMIT = 300;
export const XP_DAILY_ACTION_LIMIT = 5;

export function isDreamCompletionTransition(before, after) {
    return before?.status !== 'completed' && after?.status === 'completed';
}

const VALID_STATUSES = {
    travels: new Set(['planned', 'visited']),
    restaurants: new Set(['want_to_visit', 'visited']),
    movies: new Set(['to_watch', 'watched']),
    books: new Set(['want_to_read', 'reading', 'read']),
    dreams: new Set(['dreaming', 'in_progress', 'completed'])
};
const VALID_TRAVEL_TYPES = new Set(['city', 'nature', 'mountains', 'beach', 'culture']);
const VALID_CUISINES = new Set(['', 'Итальянская', 'Японская', 'Русская', 'Французская', 'Мексиканская', 'Китайская', 'Индийская', 'Грузинская']);
const VALID_DREAM_CATEGORIES = new Set(['', 'Путешествия', 'Карьера', 'Творчество', 'Спорт', 'Отношения', 'Знания', 'Материальное', 'Другое']);

const validRecordSegment = value => typeof value === 'string' &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value);
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0;

export function isRewardableCollectionRecord(collectionName, data, recordId) {
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        !validRecordSegment(recordId) || recordId === '_init') return false;
    switch (collectionName) {
        case 'travels':
            return nonEmptyString(data.title) && VALID_TRAVEL_TYPES.has(data.type) &&
                VALID_STATUSES.travels.has(data.status);
        case 'restaurants':
            return nonEmptyString(data.name) && VALID_CUISINES.has(data.cuisine) &&
                VALID_STATUSES.restaurants.has(data.status);
        case 'movies':
            return nonEmptyString(data.title) && Number.isSafeInteger(data.movieId) &&
                data.movieId > 0 && VALID_STATUSES.movies.has(data.status);
        case 'books':
            return nonEmptyString(data.title) && nonEmptyString(data.author) &&
                VALID_STATUSES.books.has(data.status);
        case 'dreams':
            return nonEmptyString(data.title) && VALID_DREAM_CATEGORIES.has(data.category ?? '') &&
                VALID_STATUSES.dreams.has(data.status);
        case 'friends':
            return data.friendId === recordId;
        default:
            return false;
    }
}
