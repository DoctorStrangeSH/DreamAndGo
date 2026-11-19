import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyCollectionSearchAndSort } from '../js/core/collection-search.js';

const source = readFileSync(new URL('../js/modules/books/books.js', import.meta.url), 'utf8');

test('library search covers title, author, and genres with escaped attributes', () => {
    assert.match(source, /<label class="visually-hidden" for="bookSearch">/);
    assert.match(source, /<label class="visually-hidden" for="bookSort">/);
    assert.match(source, /value="\$\{escapeHTML\(this\.searchQuery\)\}"/);
    assert.match(source, /data-search="\$\{escapeHTML\(\[book\.title, book\.author, \.\.\.\(Array\.isArray\(book\.genres\)/);
    assert.match(source, /id="bookSearchCount" role="status" aria-live="polite"/);
});

test('library filters and sorts cards locally, restoring original order when requested', () => {
    const from = source.indexOf('    applySearchAndSort() {');
    const to = source.indexOf('    async showModal(', from);
    assert.ok(from >= 0 && to > from);
    const cards = [
        { dataset: { search: 'дюна франк герберт фантастика', name: 'дюна', rating: '10', originalIndex: '0' }, hidden: false },
        { dataset: { search: 'мастер и маргарита михаил булгаков роман', name: 'мастер и маргарита', rating: '8', originalIndex: '1' }, hidden: false },
        { dataset: { search: '1984 джордж оруэлл фантастика', name: '1984', rating: '9', originalIndex: '2' }, hidden: false }
    ];
    const grid = {
        children: [...cards],
        querySelectorAll() { return this.children; },
        appendChild(card) {
            this.children.splice(this.children.indexOf(card), 1);
            this.children.push(card);
        }
    };
    const empty = { hidden: true };
    const count = { textContent: '' };
    const document = { getElementById: id => ({ booksGrid: grid, bookSearchEmpty: empty, bookSearchCount: count })[id] };
    const Module = new Function('document', 'applyCollectionSearchAndSort', `return class Module { ${source.slice(from, to)} }`)(document, applyCollectionSearchAndSort);
    const module = new Module();
    module.searchQuery = '  БУЛГАКОВ  ';
    module.sortOrder = 'rating';
    module.applySearchAndSort();
    assert.deepEqual(grid.children, [cards[0], cards[2], cards[1]]);
    assert.deepEqual(cards.map(card => card.hidden), [true, false, true]);
    assert.equal(count.textContent, 'Найдено: 1 из 3');

    module.searchQuery = 'не существует';
    module.applySearchAndSort();
    assert.equal(empty.hidden, false);

    module.searchQuery = '';
    module.sortOrder = 'name';
    module.applySearchAndSort();
    assert.deepEqual(grid.children, [cards[2], cards[0], cards[1]]);
    assert.deepEqual(cards.map(card => card.hidden), [false, false, false]);
    assert.equal(empty.hidden, true);

    module.sortOrder = 'recent';
    module.applySearchAndSort();
    assert.deepEqual(grid.children, cards);
    grid.children = [];
    module.searchQuery = 'дюна';
    module.applySearchAndSort();
    assert.equal(empty.hidden, true);
});
