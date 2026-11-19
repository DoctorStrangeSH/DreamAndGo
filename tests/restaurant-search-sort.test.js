import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/restaurants/restaurants.js', import.meta.url), 'utf8');

test('restaurant controls are labeled and search metadata is escaped', () => {
    assert.match(source, /<label class="visually-hidden" for="restaurantSearch">/);
    assert.match(source, /<label class="visually-hidden" for="restaurantSort">/);
    assert.match(source, /value="\$\{escapeHTML\(this\.searchQuery\)\}"/);
    assert.match(source, /data-search="\$\{escapeHTML\(\[restaurant\.name, restaurant\.cuisine, restaurant\.address, restaurant\.review\]/);
    assert.match(source, /id="restaurantSearchCount" role="status" aria-live="polite"/);
});

test('restaurant search and sorting are local, reversible, and preserve empty states', () => {
    const from = source.indexOf('    applySearchAndSort() {');
    const to = source.indexOf('    async showModal(', from);
    assert.ok(from >= 0 && to > from);
    const cards = [
        { dataset: { search: 'траттория итальянская москва', name: 'траттория', rating: '9', originalIndex: '0' }, hidden: false },
        { dataset: { search: 'суши японская санкт-петербург', name: 'суши', rating: '7', originalIndex: '1' }, hidden: false },
        { dataset: { search: 'бистро французская казань', name: 'бистро', rating: '10', originalIndex: '2' }, hidden: false }
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
    const document = { getElementById: id => ({ restaurantsGrid: grid, restaurantSearchEmpty: empty, restaurantSearchCount: count })[id] };
    const Module = new Function('document', `return class Module { ${source.slice(from, to)} }`)(document);
    const module = new Module();
    module.sortOrder = 'rating';
    module.searchQuery = '  ЯПОНСКАЯ ';
    module.applySearchAndSort();
    assert.deepEqual(grid.children, [cards[2], cards[0], cards[1]]);
    assert.deepEqual(cards.map(card => card.hidden), [true, false, true]);
    assert.equal(count.textContent, 'Найдено: 1 из 3');

    module.searchQuery = 'неизвестно';
    module.applySearchAndSort();
    assert.equal(empty.hidden, false);

    module.sortOrder = 'name';
    module.searchQuery = '';
    module.applySearchAndSort();
    assert.deepEqual(grid.children, [cards[2], cards[1], cards[0]]);
    assert.deepEqual(cards.map(card => card.hidden), [false, false, false]);
    assert.equal(empty.hidden, true);

    module.sortOrder = 'recent';
    module.applySearchAndSort();
    assert.deepEqual(grid.children, cards);
    grid.children = [];
    module.searchQuery = 'итальянская';
    module.applySearchAndSort();
    assert.equal(empty.hidden, true);
});
