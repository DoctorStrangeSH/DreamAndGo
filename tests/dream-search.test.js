import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyCollectionSearchAndSort } from '../js/core/collection-search.js';

const source = readFileSync(new URL('../js/modules/dreams/dreams.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/atlas-illustrations.css', import.meta.url), 'utf8');

test('dream search renders a labeled field and escaped searchable card content', () => {
    assert.match(source, /<label class="visually-hidden" for="dreamSearch">/);
    assert.match(source, /<label class="visually-hidden" for="dreamSort">/);
    assert.match(source, /value="\$\{escapeHTML\(this\.searchQuery\)\}"/);
    assert.match(source, /data-search="\$\{escapeHTML\(\[dream\.title, dream\.description, dream\.category\]/);
    assert.match(source, /id="dreamSearchCount" role="status" aria-live="polite"/);
    assert.match(source, /data-rating="\$\{progress\}" data-original-index="\$\{index\}"/);
    assert.match(css, /\.atlas-empty\[hidden\]\s*\{display:none\}/);
});

test('dream search and sorting preserve cards, filter locally, and handle empty states', () => {
    const from = source.indexOf('    applySearchAndSort() {');
    const to = source.indexOf('    async showModal(', from);
    assert.ok(from >= 0 && to > from);
    const cards = [
        { dataset: { search: 'поехать в японию путешествия', name: 'япония', rating: '35', originalIndex: '0' }, hidden: false },
        { dataset: { search: 'написать книгу творчество', name: 'книга', rating: '80', originalIndex: '1' }, hidden: false }
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
    const document = {
        getElementById: id => ({ dreamsGrid: grid, dreamSearchEmpty: empty, dreamSearchCount: count })[id]
    };
    const Module = new Function('document', 'applyCollectionSearchAndSort', `return class Module { ${source.slice(from, to)} }`)(document, applyCollectionSearchAndSort);
    const module = new Module();
    module.searchQuery = '  КНИГУ  ';
    module.sortOrder = 'rating';
    module.applySearchAndSort();
    assert.deepEqual(cards.map(card => card.hidden), [true, false]);
    assert.deepEqual(grid.children, [cards[1], cards[0]]);
    assert.equal(count.textContent, 'Найдено: 1 из 2');
    assert.equal(empty.hidden, true);

    module.searchQuery = 'несуществующая';
    module.applySearchAndSort();
    assert.deepEqual(cards.map(card => card.hidden), [true, true]);
    assert.equal(empty.hidden, false);

    module.searchQuery = '';
    module.sortOrder = 'name';
    module.applySearchAndSort();
    assert.deepEqual(cards.map(card => card.hidden), [false, false]);
    assert.deepEqual(grid.children, [cards[1], cards[0]]);
    assert.equal(empty.hidden, true);

    module.sortOrder = 'recent';
    module.applySearchAndSort();
    assert.deepEqual(grid.children, cards);
    grid.children = [];
    module.searchQuery = 'мечта';
    module.applySearchAndSort();
    assert.equal(empty.hidden, true);
});
