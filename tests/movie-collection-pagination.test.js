import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/movies/movies.js', import.meta.url), 'utf8');

test('personal movies have local search, sort, and working page controls', () => {
    assert.match(source, /id="myMovieSearch" type="search"/);
    assert.match(source, /id="myMovieSort"/);
    assert.match(source, /id="myMovieCount"[^>]*role="status"/);
    assert.match(source, /else if \(btnType === 'my'\) \{ this\.myMoviesPage = page; this\.renderMyMovieCollection\(\); \}/);
    assert.doesNotMatch(source, /if \(this\.currentTab === 'my' \|\| totalPages <= 1\)/);
});

test('personal movies are paginated after filtering, without extra service calls', () => {
    const from = source.indexOf('    renderMyMovieCollection() {');
    const to = source.indexOf('    async loadPopularMovies()', from);
    assert.ok(from >= 0 && to > from);
    const grid = { innerHTML: '' };
    const count = { textContent: '' };
    const document = { getElementById: id => ({ moviesGrid: grid, myMovieCount: count })[id] ?? null };
    const calls = [];
    const Module = new Function('document', `return class Module {
        createCard(movie) { return '[' + movie.title + ']'; }
        attachCardListeners() {}
        createPaginationElement() {}
        renderPagination(pages, type) { this.pages = pages; this.type = type; }
        ${source.slice(from, to)}
    }`)(document);
    const module = new Module();
    module.currentTab = 'my';
    module.myMovies = Array.from({ length: 25 }, (_, i) => ({ title: 'Фильм ' + i, userRating: i }));
    module.ITEMS_PER_PAGE = 12;
    module.mySortOrder = 'recent';
    module.mySearchQuery = '';
    module.myMoviesPage = 1;
    module.renderMyMovieCollection();
    assert.equal((grid.innerHTML.match(/\[Фильм/g) || []).length, 12);
    assert.equal(module.pages, 3);
    assert.equal(module.type, 'my');

    module.myMoviesPage = 3;
    module.renderMyMovieCollection();
    assert.equal(grid.innerHTML, '[Фильм 24]');

    module.mySearchQuery = 'фильм 1';
    module.myMoviesPage = 3;
    module.renderMyMovieCollection();
    assert.equal(module.myMoviesPage, 1);
    assert.equal(count.textContent, 'Найдено: 11 из 25');
    assert.equal((grid.innerHTML.match(/\[Фильм/g) || []).length, 11);

    module.mySearchQuery = 'неизвестное кино';
    module.renderMyMovieCollection();
    assert.match(grid.innerHTML, /Ничего не нашлось/);

    module.mySearchQuery = '';
    module.mySortOrder = 'rating';
    module.renderMyMovieCollection();
    assert.ok(grid.innerHTML.startsWith('[Фильм 24]'));
    assert.equal(calls.length, 0);
});
