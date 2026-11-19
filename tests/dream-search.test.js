import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/dreams/dreams.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/atlas-illustrations.css', import.meta.url), 'utf8');

test('dream search renders a labeled field and escaped searchable card content', () => {
    assert.match(source, /<label class="visually-hidden" for="dreamSearch">/);
    assert.match(source, /value="\$\{escapeHTML\(this\.searchQuery\)\}"/);
    assert.match(source, /data-search="\$\{escapeHTML\(\[dream\.title, dream\.description, dream\.category\]/);
    assert.match(source, /id="dreamSearchCount" role="status" aria-live="polite"/);
    assert.match(css, /\.atlas-empty\[hidden\]\s*\{display:none\}/);
});

test('dream search filters locally and handles empty results without hiding normal empty states', () => {
    const from = source.indexOf('    applySearch() {');
    const to = source.indexOf('    async showModal(', from);
    assert.ok(from >= 0 && to > from);
    const cards = [
        { dataset: { search: 'поехать в японию путешествия' }, hidden: false },
        { dataset: { search: 'написать книгу творчество' }, hidden: false }
    ];
    const empty = { hidden: true };
    const count = { textContent: '' };
    const document = {
        querySelectorAll: () => cards,
        getElementById: id => id === 'dreamSearchEmpty' ? empty : count
    };
    const Module = new Function('document', `return class Module { ${source.slice(from, to)} }`)(document);
    const module = new Module();
    module.searchQuery = '  КНИГУ  ';
    module.applySearch();
    assert.deepEqual(cards.map(card => card.hidden), [true, false]);
    assert.equal(count.textContent, 'Найдено: 1 из 2');
    assert.equal(empty.hidden, true);

    module.searchQuery = 'несуществующая';
    module.applySearch();
    assert.deepEqual(cards.map(card => card.hidden), [true, true]);
    assert.equal(empty.hidden, false);

    module.searchQuery = '';
    module.applySearch();
    assert.deepEqual(cards.map(card => card.hidden), [false, false]);
    assert.equal(empty.hidden, true);

    cards.length = 0;
    module.searchQuery = 'мечта';
    module.applySearch();
    assert.equal(empty.hidden, true);
});
