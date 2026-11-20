import test from 'node:test';
import assert from 'node:assert/strict';
import {
    validateTravelInput,
    validateBookInput,
    validateMovieInput,
    validateRestaurantInput
} from '../js/core/collection-input-policy.js';

const travel = () => ({
    title: 'Летняя поездка', type: 'city', status: 'planned', location: 'Прага',
    description: 'Выходные в городе', budget: { planned: 500, spent: 0, currency: 'EUR' },
    rating: 8, notes: '', photos: ['https://cdn.example.test/trip.jpg']
});
const book = () => ({
    title: 'Дюна', author: 'Фрэнк Герберт', status: 'reading', genres: ['Фантастика'],
    year: 1965, totalPages: 500, currentPage: 120, userRating: 9,
    review: '', quotes: ['Страх убивает разум']
});
const movie = () => ({
    movieId: 12345, title: 'Дюна', originalTitle: 'Dune', overview: 'На пустынной планете',
    poster: 'https://image.example.test/poster.jpg', backdrop: '', voteAverage: 8.1,
    voteCount: 100, rating: 8.1, releaseDate: '2021-09-03', genreIds: [878, 12],
    runtime: 155, tagline: '', budget: 165000000,
    productionCountries: [{ iso_3166_1: 'US', name: 'United States' }],
    status: 'to_watch', userRating: 4, review: ''
});
const restaurant = () => ({
    name: 'Тёплый дом', cuisine: 'Итальянская', status: 'want_to_visit',
    address: 'Центр города', visitDate: null, avgBill: 40, userRating: 8,
    favoriteDishes: ['Паста'], review: '', photos: []
});

test('travel schema normalizes and rejects protected fields and unsafe nested values', () => {
    assert.equal(validateTravelInput(travel()).budget.currency, 'EUR');
    assert.throws(() => validateTravelInput({ ...travel(), ownerId: 'other' }), TypeError);
    assert.throws(() => validateTravelInput({ ...travel(), budget: { ...travel().budget, isAdmin: true } }), TypeError);
    assert.throws(() => validateTravelInput({ ...travel(), photos: ['javascript:alert(1)'] }), TypeError);
    assert.throws(() => validateTravelInput({ ...travel(), rating: 11 }), TypeError);
});

test('book schema enforces statuses, genres, page bounds and bounded text', () => {
    assert.equal(validateBookInput(book()).currentPage, 120);
    assert.throws(() => validateBookInput({ ...book(), status: 'admin' }), TypeError);
    assert.throws(() => validateBookInput({ ...book(), genres: ['Неизвестный жанр'] }), TypeError);
    assert.throws(() => validateBookInput({ ...book(), currentPage: 501 }), TypeError);
    assert.throws(() => validateBookInput({ ...book(), isPublic: true }), TypeError);
});

test('movie schema accepts API metadata and rejects arbitrary IDs, URLs and statuses', () => {
    assert.deepEqual(validateMovieInput(movie()).genreIds, [878, 12]);
    assert.throws(() => validateMovieInput({ ...movie(), movieId: 0 }), TypeError);
    assert.throws(() => validateMovieInput({ ...movie(), poster: 'javascript:alert(1)' }), TypeError);
    assert.throws(() => validateMovieInput({ ...movie(), status: 'public' }), TypeError);
    assert.throws(() => validateMovieInput({ ...movie(), productionCountries: [{ iso_3166_1: 'US', name: 'US', admin: true }] }), TypeError);
});

test('restaurant schema validates cuisine, dates, rating, dishes and photo URLs', () => {
    assert.equal(validateRestaurantInput(restaurant()).name, 'Тёплый дом');
    assert.throws(() => validateRestaurantInput({ ...restaurant(), cuisine: 'Unknown' }), TypeError);
    assert.throws(() => validateRestaurantInput({ ...restaurant(), visitDate: '2026-02-31' }), TypeError);
    assert.throws(() => validateRestaurantInput({ ...restaurant(), userRating: -1 }), TypeError);
    assert.throws(() => validateRestaurantInput({ ...restaurant(), photos: ['http://example.test/a.jpg'] }), TypeError);
});

test('partial updates accept only explicitly supplied allowlisted fields', () => {
    assert.deepEqual(validateTravelInput({ notes: 'Новые заметки' }, { partial: true }), { notes: 'Новые заметки' });
    assert.deepEqual(validateBookInput({ review: 'Хорошая книга' }, { partial: true }), { review: 'Хорошая книга' });
    assert.deepEqual(validateMovieInput({ status: 'watched' }, { partial: true }), { status: 'watched' });
    assert.deepEqual(validateRestaurantInput({ userRating: 10 }, { partial: true }), { userRating: 10 });
    assert.throws(() => validateBookInput({ role: 'admin' }, { partial: true }), TypeError);
});
