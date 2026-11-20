const TRAVEL_TYPES = new Set(['city', 'nature', 'mountains', 'beach', 'culture']);
const TRAVEL_STATUSES = new Set(['planned', 'visited']);
const CURRENCIES = new Set(['RUB', 'USD', 'EUR']);
const BOOK_STATUSES = new Set(['want_to_read', 'reading', 'read']);
const BOOK_GENRES = new Set(['Фантастика', 'Детектив', 'Роман', 'Биография', 'История', 'Психология', 'Бизнес', 'Наука', 'Философия', 'Другое']);
const MOVIE_STATUSES = new Set(['to_watch', 'watched']);
const MOVIE_GENRES = new Set([28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37]);
const CUISINES = new Set(['', 'Итальянская', 'Японская', 'Русская', 'Французская', 'Мексиканская', 'Китайская', 'Индийская', 'Грузинская']);
const RESTAURANT_STATUSES = new Set(['want_to_visit', 'visited']);
const KEYS = {
    travel: new Set(['title', 'type', 'status', 'location', 'description', 'budget', 'rating', 'notes', 'photos']),
    book: new Set(['title', 'author', 'status', 'genres', 'year', 'totalPages', 'currentPage', 'userRating', 'review', 'quotes']),
    movie: new Set(['movieId', 'title', 'originalTitle', 'overview', 'poster', 'backdrop', 'voteAverage', 'voteCount', 'rating', 'releaseDate', 'genreIds', 'runtime', 'tagline', 'budget', 'productionCountries', 'status', 'userRating', 'review']),
    restaurant: new Set(['name', 'cuisine', 'status', 'address', 'visitDate', 'avgBill', 'userRating', 'favoriteDishes', 'review', 'photos'])
};

function record(raw, allowed, label) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Некорректные данные: ' + label);
    if (Object.keys(raw).some(key => !allowed.has(key))) throw new TypeError('Недопустимые поля: ' + label);
    return raw;
}
function string(value, field, max, { required = false, allowEmpty = true } = {}) {
    if (typeof value !== 'string') throw new TypeError('Некорректное поле: ' + field);
    const normalized = value.trim();
    if (required && !normalized) throw new TypeError('Заполни поле: ' + field);
    if ((!allowEmpty && !normalized) || normalized.length > max) throw new TypeError('Некорректное поле: ' + field);
    return normalized;
}
function integer(value, field, min, max) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError('Некорректное число: ' + field);
    return value;
}
function enumValue(value, values, field) {
    if (!values.has(value)) throw new TypeError('Недопустимое значение: ' + field);
    return value;
}
function date(value, field, nullable = false) {
    if (nullable && (value === null || value === '')) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Некорректная дата: ' + field);
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
        throw new TypeError('Некорректная дата: ' + field);
    }
    return value;
}
function textList(value, field, maxItems, maxLength, allowed = null) {
    if (!Array.isArray(value) || value.length > maxItems) throw new TypeError('Некорректный список: ' + field);
    const result = value.map(item => string(item, field, maxLength, { required: true, allowEmpty: false }));
    if (new Set(result).size !== result.length || (allowed && result.some(item => !allowed.has(item)))) {
        throw new TypeError('Недопустимые элементы: ' + field);
    }
    return result;
}
function photoList(value) {
    if (!Array.isArray(value) || value.length > 10) throw new TypeError('Некорректный список фотографий');
    return value.map(item => {
        const url = string(item, 'photos', 2048, { required: true, allowEmpty: false });
        let parsed;
        try { parsed = new URL(url); } catch { throw new TypeError('Некорректная ссылка фотографии'); }
        if (parsed.protocol !== 'https:') throw new TypeError('Фотографии должны использовать HTTPS');
        return url;
    });
}
function review(value, field = 'review') {
    return string(value, field, 4000);
}

export function validateTravelInput(raw, { partial = false } = {}) {
    const input = record(raw, KEYS.travel, 'путешествие');
    const out = {};
    const fields = ['title', 'type', 'status', 'location', 'description', 'budget', 'rating', 'notes', 'photos'];
    for (const key of fields) if (Object.hasOwn(input, key)) {
        switch (key) {
            case 'title': out.title = string(input.title, key, 120, { required: !partial, allowEmpty: false }); break;
            case 'type': out.type = enumValue(input.type, TRAVEL_TYPES, key); break;
            case 'status': out.status = enumValue(input.status, TRAVEL_STATUSES, key); break;
            case 'location': out.location = string(input.location, key, 200); break;
            case 'description': out.description = string(input.description, key, 4000); break;
            case 'budget': {
                record(input.budget, new Set(['planned', 'spent', 'currency']), 'бюджет');
                out.budget = {
                    planned: integer(input.budget.planned, 'budget.planned', 0, 1000000000),
                    spent: integer(input.budget.spent, 'budget.spent', 0, 1000000000),
                    currency: enumValue(input.budget.currency, CURRENCIES, 'budget.currency')
                };
                break;
            }
            case 'rating': out.rating = integer(input.rating, key, 0, 10); break;
            case 'notes': out.notes = string(input.notes, key, 4000); break;
            case 'photos': out.photos = photoList(input.photos); break;
        }
    }
    if (!partial && (!out.title || !out.type || !out.status)) throw new TypeError('Заполни обязательные поля путешествия');
    return out;
}

export function validateBookInput(raw, { partial = false } = {}) {
    const input = record(raw, KEYS.book, 'книга');
    const out = {};
    for (const key of KEYS.book) if (Object.hasOwn(input, key)) {
        switch (key) {
            case 'title': out.title = string(input.title, key, 200, { required: !partial, allowEmpty: false }); break;
            case 'author': out.author = string(input.author, key, 120, { required: !partial, allowEmpty: false }); break;
            case 'status': out.status = enumValue(input.status, BOOK_STATUSES, key); break;
            case 'genres': out.genres = textList(input.genres, key, 10, 40, BOOK_GENRES); break;
            case 'year': out.year = input.year === null ? null : integer(input.year, key, 1000, 2099); break;
            case 'totalPages': out.totalPages = integer(input.totalPages, key, 0, 100000); break;
            case 'currentPage': out.currentPage = integer(input.currentPage, key, 0, 100000); break;
            case 'userRating': out.userRating = integer(input.userRating, key, 0, 10); break;
            case 'review': out.review = review(input.review); break;
            case 'quotes': out.quotes = textList(input.quotes, key, 30, 500); break;
        }
    }
    if (!partial && (!out.title || !out.author || !out.status)) throw new TypeError('Заполни обязательные поля книги');
    const total = out.totalPages ?? 0, current = out.currentPage ?? 0;
    if ((!partial || (Object.hasOwn(out, 'currentPage') && Object.hasOwn(out, 'totalPages'))) && current > total) {
        throw new TypeError('Текущая страница не может превышать общее количество страниц');
    }
    return out;
}

export function validateMovieInput(raw, { partial = false } = {}) {
    const input = record(raw, KEYS.movie, 'фильм');
    const out = {};
    for (const key of KEYS.movie) if (Object.hasOwn(input, key)) {
        switch (key) {
            case 'movieId': out.movieId = integer(input.movieId, key, 1, 1000000000); break;
            case 'title': out.title = string(input.title, key, 200, { required: !partial, allowEmpty: false }); break;
            case 'originalTitle': out.originalTitle = string(input.originalTitle, key, 200); break;
            case 'overview': out.overview = string(input.overview, key, 5000); break;
            case 'poster':
            case 'backdrop': {
                const url = string(input[key], key, 2048);
                if (url) {
                    let parsed;
                    try { parsed = new URL(url); } catch { throw new TypeError('Некорректная ссылка: ' + key); }
                    if (parsed.protocol !== 'https:') throw new TypeError('Ссылка должна использовать HTTPS: ' + key);
                }
                out[key] = url;
                break;
            }
            case 'voteAverage':
            case 'rating': {
                if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] < 0 || input[key] > 10) throw new TypeError('Некорректный рейтинг: ' + key);
                out[key] = input[key];
                break;
            }
            case 'voteCount': out.voteCount = integer(input.voteCount, key, 0, 1000000000); break;
            case 'releaseDate': out.releaseDate = input.releaseDate === '' ? '' : date(input.releaseDate, key); break;
            case 'genreIds': {
                if (!Array.isArray(input.genreIds) || input.genreIds.length > 20) throw new TypeError('Некорректные жанры фильма');
                out.genreIds = input.genreIds.map(id => integer(id, key, 1, 200000) ).filter(id => MOVIE_GENRES.has(id));
                if (out.genreIds.length !== input.genreIds.length || new Set(out.genreIds).size !== out.genreIds.length) throw new TypeError('Неизвестный жанр фильма');
                break;
            }
            case 'runtime': out.runtime = integer(input.runtime, key, 0, 1000); break;
            case 'tagline': out.tagline = string(input.tagline, key, 300); break;
            case 'budget': out.budget = integer(input.budget, key, 0, 100000000000); break;
            case 'productionCountries': {
                if (!Array.isArray(input.productionCountries) || input.productionCountries.length > 30) throw new TypeError('Некорректный список стран');
                out.productionCountries = input.productionCountries.map(country => {
                    record(country, new Set(['iso_3166_1', 'name']), 'страна производства');
                    return {
                        iso_3166_1: string(country.iso_3166_1, 'iso_3166_1', 2, { required: true, allowEmpty: false }),
                        name: string(country.name, 'country.name', 80, { required: true, allowEmpty: false })
                    };
                });
                break;
            }
            case 'status': out.status = enumValue(input.status, MOVIE_STATUSES, key); break;
            case 'userRating': out.userRating = integer(input.userRating, key, 0, 5); break;
            case 'review': out.review = review(input.review); break;
        }
    }
    if (!partial && (!out.title || !out.status || !out.movieId)) throw new TypeError('Некорректные обязательные поля фильма');
    return out;
}

export function validateRestaurantInput(raw, { partial = false } = {}) {
    const input = record(raw, KEYS.restaurant, 'ресторан');
    const out = {};
    for (const key of KEYS.restaurant) if (Object.hasOwn(input, key)) {
        switch (key) {
            case 'name': out.name = string(input.name, key, 160, { required: !partial, allowEmpty: false }); break;
            case 'cuisine': out.cuisine = enumValue(input.cuisine, CUISINES, key); break;
            case 'status': out.status = enumValue(input.status, RESTAURANT_STATUSES, key); break;
            case 'address': out.address = string(input.address, key, 300); break;
            case 'visitDate': out.visitDate = date(input.visitDate, key, true); break;
            case 'avgBill': out.avgBill = integer(input.avgBill, key, 0, 10000000); break;
            case 'userRating': out.userRating = integer(input.userRating, key, 0, 10); break;
            case 'favoriteDishes': out.favoriteDishes = textList(input.favoriteDishes, key, 20, 80); break;
            case 'review': out.review = review(input.review); break;
            case 'photos': out.photos = photoList(input.photos); break;
        }
    }
    if (!partial && (!out.name || !out.status || out.cuisine === undefined)) throw new TypeError('Заполни обязательные поля ресторана');
    return out;
}
