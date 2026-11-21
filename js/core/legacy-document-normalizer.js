import { validateLegacyMigrationManifest } from './legacy-migration-manifest.js';

const STATUSES = {
    dreams: ['dreaming', 'in_progress', 'completed'],
    travels: ['planned', 'visited'],
    books: ['want_to_read', 'reading', 'read'],
    movies: ['to_watch', 'watched'],
    restaurants: ['want_to_visit', 'visited']
};
const ENUMS = {
    dreams: { category: ['', 'Путешествия', 'Карьера', 'Творчество', 'Спорт', 'Отношения', 'Знания', 'Материальное', 'Другое'] },
    travels: { type: ['city', 'nature', 'mountains', 'beach', 'culture'], 'budget.currency': ['RUB', 'USD', 'EUR'] },
    books: { genres: ['Фантастика', 'Детектив', 'Роман', 'Биография', 'История', 'Психология', 'Бизнес', 'Наука', 'Философия', 'Другое'] },
    movies: { genreIds: [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37] },
    restaurants: { cuisine: ['', 'Итальянская', 'Японская', 'Русская', 'Французская', 'Мексиканская', 'Китайская', 'Индийская', 'Грузинская'] }
};
const FIELDS = {
    dreams: ['title','category','status','description','progress','deadline','steps','createdAt','updatedAt'],
    travels: ['title','type','status','location','description','budget','rating','notes','photos','createdAt','updatedAt'],
    books: ['title','author','status','genres','year','totalPages','currentPage','userRating','review','quotes','notes','createdAt','updatedAt'],
    movies: ['movieId','title','originalTitle','overview','poster','backdrop','voteAverage','voteCount','rating','releaseDate','genreIds','runtime','tagline','budget','productionCountries','status','userRating','review','notes','createdAt','updatedAt'],
    restaurants: ['name','cuisine','status','address','visitDate','avgBill','userRating','favoriteDishes','review','photos','notes','createdAt','updatedAt']
};
const REQUIRED = {
    dreams: ['title','createdAt','updatedAt'],
    travels: ['title','type','status','createdAt','updatedAt'],
    books: ['title','author','status','notes','createdAt','updatedAt'],
    movies: ['movieId','title','status','notes','createdAt','updatedAt'],
    restaurants: ['name','cuisine','status','notes','createdAt','updatedAt']
};
const isInt = value => Number.isInteger(value);
const isString = value => typeof value === 'string';
const boundedString = (value, max, min = 0) => isString(value) && value.length >= min && value.length <= max;
const dateString = value => value === '' || (isString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && (() => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
})());
const timestamp = value => value instanceof Date ? !Number.isNaN(value.valueOf()) :
    Boolean(value && typeof value === 'object' && Number.isInteger(value.seconds) &&
        Number.isInteger(value.nanoseconds) && value.nanoseconds >= 0 && value.nanoseconds < 1e9 &&
        value.seconds >= -62135596800 && value.seconds <= 253402300799);
const httpsList = (value, max) => Array.isArray(value) && value.length <= max &&
    value.every(item => isString(item) && item.length <= 2048 && (() => {
        try { return new URL(item).protocol === 'https:'; } catch { return false; }
    })());
const uniqueStrings = (value, maxCount, maxLength, allowlist) => Array.isArray(value) &&
    value.length <= maxCount && value.every(item => boundedString(item, maxLength, 1) &&
        (!allowlist || allowlist.includes(item))) && new Set(value).size === value.length;
const rangeInt = (value, min, max) => isInt(value) && value >= min && value <= max;
const rangeNumber = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

function validateDocument(collection, document) {
    const errors = [];
    if (!document || typeof document !== 'object' || Array.isArray(document)) {
        return ['document_must_be_object'];
    }
    const allowed = new Set(FIELDS[collection]);
    for (const key of Object.keys(document)) if (!allowed.has(key)) errors.push(`unknown_target_field:${key}`);
    for (const key of REQUIRED[collection]) if (!Object.hasOwn(document, key)) errors.push(`required_field_missing:${key}`);
    for (const [key, value] of Object.entries(document)) {
        let valid = true;
        switch (collection + '.' + key) {
            case 'dreams.title': valid = boundedString(value, 120, 1) && value.trim().length > 0; break;
            case 'dreams.category': valid = ENUMS.dreams.category.includes(value); break;
            case 'dreams.status': valid = STATUSES.dreams.includes(value); break;
            case 'dreams.description': valid = boundedString(value, 4000); break;
            case 'dreams.progress': valid = rangeInt(value, 0, 100); break;
            case 'dreams.deadline': valid = value === null || dateString(value); break;
            case 'dreams.steps': valid = Array.isArray(value) && value.length <= 20 && value.every(item =>
                item && typeof item === 'object' && !Array.isArray(item) &&
                Object.keys(item).length === 2 && boundedString(item.text, 200, 1) && typeof item.done === 'boolean'); break;
            case 'travels.title': valid = boundedString(value, 120, 1); break;
            case 'travels.type': valid = ENUMS.travels.type.includes(value); break;
            case 'travels.status': valid = STATUSES.travels.includes(value); break;
            case 'travels.location': valid = boundedString(value, 200); break;
            case 'travels.description': case 'travels.notes': valid = boundedString(value, 4000); break;
            case 'travels.budget': valid = value && typeof value === 'object' && !Array.isArray(value) &&
                Object.keys(value).length === 3 && rangeInt(value.planned, 0, 1e9) &&
                rangeInt(value.spent, 0, 1e9) && ENUMS.travels['budget.currency'].includes(value.currency); break;
            case 'travels.rating': valid = rangeInt(value, 0, 10); break;
            case 'travels.photos': valid = httpsList(value, 10); break;
            case 'books.title': valid = boundedString(value, 200, 1); break;
            case 'books.author': valid = boundedString(value, 120, 1); break;
            case 'books.status': valid = STATUSES.books.includes(value); break;
            case 'books.genres': valid = uniqueStrings(value, 10, 40, ENUMS.books.genres); break;
            case 'books.year': valid = value === null || rangeInt(value, 1000, 2099); break;
            case 'books.totalPages': case 'books.currentPage': valid = rangeInt(value, 0, 100000); break;
            case 'books.userRating': valid = rangeInt(value, 0, 10); break;
            case 'books.review': case 'books.notes': valid = boundedString(value, 4000); break;
            case 'books.quotes': valid = uniqueStrings(value, 30, 500); break;
            case 'movies.movieId': valid = rangeInt(value, 1, 1e9); break;
            case 'movies.title': case 'movies.originalTitle': valid = boundedString(value, 200, key === 'title' ? 1 : 0); break;
            case 'movies.status': valid = STATUSES.movies.includes(value); break;
            case 'movies.overview': valid = boundedString(value, 5000); break;
            case 'movies.poster': case 'movies.backdrop': valid = value === '' || (isString(value) && value.length <= 2048 && (() => { try { return new URL(value).protocol === 'https:'; } catch { return false; } })()); break;
            case 'movies.voteAverage': case 'movies.rating': valid = rangeNumber(value, 0, 10); break;
            case 'movies.voteCount': valid = rangeInt(value, 0, 1e9); break;
            case 'movies.releaseDate': valid = dateString(value); break;
            case 'movies.genreIds': valid = Array.isArray(value) && value.length <= 20 &&
                value.every(item => isInt(item) && ENUMS.movies.genreIds.includes(item)) && new Set(value).size === value.length; break;
            case 'movies.runtime': valid = rangeInt(value, 0, 1000); break;
            case 'movies.tagline': valid = boundedString(value, 300); break;
            case 'movies.budget': valid = rangeInt(value, 0, 1e11); break;
            case 'movies.productionCountries': valid = Array.isArray(value) && value.length <= 10 && value.every(item =>
                item && typeof item === 'object' && !Array.isArray(item) &&
                Object.keys(item).length === 2 && boundedString(item.iso_3166_1, 2, 1) &&
                boundedString(item.name, 80, 1)); break;
            case 'movies.userRating': valid = rangeInt(value, 0, 5); break;
            case 'movies.review': case 'movies.notes': valid = boundedString(value, 4000); break;
            case 'restaurants.name': valid = boundedString(value, 160, 1); break;
            case 'restaurants.cuisine': valid = ENUMS.restaurants.cuisine.includes(value); break;
            case 'restaurants.status': valid = STATUSES.restaurants.includes(value); break;
            case 'restaurants.address': valid = boundedString(value, 300); break;
            case 'restaurants.visitDate': valid = value === null || dateString(value); break;
            case 'restaurants.avgBill': valid = rangeInt(value, 0, 1e7); break;
            case 'restaurants.userRating': valid = rangeInt(value, 0, 10); break;
            case 'restaurants.favoriteDishes': valid = uniqueStrings(value, 20, 80); break;
            case 'restaurants.review': case 'restaurants.notes': valid = boundedString(value, 4000); break;
            case 'restaurants.photos': valid = httpsList(value, 10); break;
            case 'dreams.createdAt': case 'dreams.updatedAt':
            case 'travels.createdAt': case 'travels.updatedAt':
            case 'books.createdAt': case 'books.updatedAt':
            case 'movies.createdAt': case 'movies.updatedAt':
            case 'restaurants.createdAt': case 'restaurants.updatedAt':
                valid = timestamp(value); break;
            default: valid = false;
        }
        if (!valid) errors.push(`invalid_field:${key}`);
    }
    if (collection === 'books' && isInt(document.currentPage) && isInt(document.totalPages) &&
        document.currentPage > document.totalPages) errors.push('current_page_exceeds_total_pages');
    return errors;
}

export function normalizeLegacyDocument({ collection, document, manifest }) {
    if (!Object.hasOwn(FIELDS, collection)) {
        return { valid: false, normalized: null, errors: ['unknown_collection'] };
    }
    if (!document || typeof document !== 'object' || Array.isArray(document)) {
        return { valid: false, normalized: null, errors: ['document_must_be_object'] };
    }
    const manifestValidation = validateLegacyMigrationManifest(manifest);
    if (!manifestValidation.valid || !manifestValidation.ready) {
        return {
            valid: false,
            normalized: null,
            errors: ['migration_manifest_not_approved', ...manifestValidation.errors]
        };
    }
    const config = manifest.collections.find(item => item.name === collection);
    if (!config) return { valid: false, normalized: null, errors: ['collection_mapping_missing'] };
    const errors = [];
    const output = {};
    const mappings = new Map(config.fields.map(item => [item.source, item]));
    for (const [source, value] of Object.entries(document)) {
        const mapping = mappings.get(source);
        if (!mapping) {
            errors.push(`unmapped_source_field:${source}`);
            continue;
        }
        if (mapping.action === 'drop' || mapping.action === 'default') continue;
        if (mapping.action === 'manual_review') {
            errors.push(`manual_review_required:${source}`);
            continue;
        }
        const target = mapping.action === 'rename' ? mapping.target : source;
        if (Object.hasOwn(output, target)) {
            errors.push(`target_field_collision:${target}`);
            continue;
        }
        output[target] = value;
    }
    for (const mapping of config.fields) {
        if (mapping.action !== 'default') continue;
        const target = mapping.target ?? mapping.source;
        if (!Object.hasOwn(output, target)) output[target] = structuredClone(mapping.value);
    }
    if (Object.hasOwn(output, 'status')) {
        output.status = config.statusMap?.[output.status] ?? output.status;
    }
    const validationErrors = validateDocument(collection, output);
    errors.push(...validationErrors);
    return {
        valid: errors.length === 0,
        normalized: errors.length === 0 ? output : null,
        errors: [...new Set(errors)],
        metadata: { collection, fields: Object.keys(output).sort(), normalizedValuesReturned: true, documentIdIncluded: false }
    };
}
