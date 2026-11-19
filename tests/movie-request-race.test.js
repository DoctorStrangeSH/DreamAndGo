import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/movies/movies.js', import.meta.url), 'utf8');
const from = source.indexOf('    async loadPopularMovies() {');
const to = source.indexOf('    createCard(', from);
assert.ok(from >= 0 && to > from);

function harness() {
    const pending = [];
    const grid = { innerHTML: '', isConnected: true, querySelector: () => null };
    const document = { getElementById: id => id === 'moviesGrid' ? grid : null };
    const window = { app: { currentUser: { uid: 'alice' }, ui: { createLoader: () => 'Loading' } } };
    const Module = new Function('document', 'window', 'console', 'pending', `return class Module {
        constructor() {
            this.requestId = 0;
            this.currentTab = 'popular';
            this.popularPage = 1;
            this.searchQuery = 'кино';
            this.searchPage = 1;
            this.movieService = {
                getPopularMovies: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
                searchMovies: () => new Promise((resolve, reject) => pending.push({ resolve, reject }))
            };
        }
        createPaginationElement() {}
        createCard(movie) { return '[' + movie.title + ']'; }
        attachCardListeners() {}
        renderPagination() {}
        ${source.slice(from, to)}
    }`)(document, window, { error() {} }, pending);
    return { module: new Module(), grid, pending, window };
}

for (const [tab, method] of [['popular', 'loadPopularMovies'], ['search', 'searchMovies']]) {
    test(`${tab} ignores old successful responses after account changes`, async () => {
        const { module, grid, pending, window } = harness();
        module.currentTab = tab;
        const request = module[method]();
        window.app.currentUser = { uid: 'bob' };
        pending[0].resolve({ movies: [{ title: 'Alice private view' }], totalPages: 1 });
        await request;
        assert.equal(grid.innerHTML, 'Loading');
    });

    test(`${tab} ignores old errors after account changes`, async () => {
        const { module, grid, pending, window } = harness();
        module.currentTab = tab;
        const request = module[method]();
        window.app.currentUser = { uid: 'bob' };
        pending[0].reject(new Error('Old network failure'));
        await request;
        assert.equal(grid.innerHTML, 'Loading');
    });
}

test('older movie requests cannot overwrite the newest active tab', async () => {
    const { module, grid, pending } = harness();
    const old = module.loadPopularMovies();
    module.currentTab = 'search';
    const current = module.searchMovies();
    pending[1].resolve({ movies: [{ title: 'Новый фильм' }], totalPages: 1 });
    await current;
    pending[0].resolve({ movies: [{ title: 'Устаревший фильм' }], totalPages: 1 });
    await old;
    assert.equal(grid.innerHTML, '[Новый фильм]');
});
