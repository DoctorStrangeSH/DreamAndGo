import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/travels/travels.js', import.meta.url), 'utf8');

test('travel search and sort controls remain accessible and escape card attributes', () => {
    assert.match(source, /<label class="visually-hidden" for="travelSearch">/);
    assert.match(source, /<label class="visually-hidden" for="travelSort">/);
    assert.match(source, /value="\$\{escapeHTML\(this\.searchQuery\)\}"/);
    assert.match(source, /data-search="\$\{escapeHTML\(\[travel\.title, travel\.location, travel\.description, typeInfo\.label\]/);
    assert.match(source, /data-name="\$\{escapeHTML\(/);
    assert.match(source, /id="travelSearchCount" role="status" aria-live="polite"/);
});

test('travel search sorts without refetching or discarding card listeners', () => {
    const from = source.indexOf('    applySearchAndSort() {');
    const to = source.indexOf('    async showModal(', from);
    assert.ok(from >= 0 && to > from);
    const cards = [
        { dataset: { search: 'япония токио', name: 'Токио'.toLocaleLowerCase(), rating: '9', originalIndex: '0' }, hidden: false },
        { dataset: { search: 'франция париж', name: 'Париж'.toLocaleLowerCase(), rating: '7', originalIndex: '1' }, hidden: false },
        { dataset: { search: 'испания мадрид', name: 'Мадрид'.toLocaleLowerCase(), rating: '10', originalIndex: '2' }, hidden: false }
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
    const document = { getElementById: id => ({ travelsGrid: grid, travelSearchEmpty: empty, travelSearchCount: count })[id] };
    const Module = new Function('document', `return class Module { ${source.slice(from, to)} }`)(document);
    const module = new Module();
    module.sortOrder = 'rating';
    module.searchQuery = '  ПАРИЖ  ';
    module.applySearchAndSort();
    assert.deepEqual(grid.children, [cards[2], cards[0], cards[1]]);
    assert.deepEqual(cards.map(card => card.hidden), [true, false, true]);
    assert.equal(count.textContent, 'Найдено: 1 из 3');
    assert.equal(empty.hidden, true);

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
});
