import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/dreams/dreams.js', import.meta.url), 'utf8');
const from = source.indexOf('    async render() {');
const to = source.indexOf('    getTemplate(', from);
assert.ok(from >= 0 && to > from);

function createHarness() {
    const pending = [];
    const main = {
        innerHTML: '', isConnected: true,
        querySelector(selector) { return this.innerHTML.includes(selector.slice(1, -1)) ? {} : null; }
    };
    const document = { getElementById: () => main };
    const window = { app: { currentUser: { uid: 'alice' }, ui: { createLoader: () => 'Загрузка...' } } };
    const Module = new Function('document', 'window', 'console', 'pending', `return class Module {
        constructor() {
            this.currentFilter = { status: 'all' };
            this.requestId = 0;
            this.dreamsService = { getDreams(_id, filters) {
                return new Promise((resolve, reject) => pending.push({ resolve, reject, filters }));
            } };
        }
        getTemplate(dreams) { return 'Результат: ' + dreams.join(','); }
        attachEventListeners() {}
        ${source.slice(from, to)}
    }`)(document, window, { error() {} }, pending);
    return { module: new Module(), main, pending, window };
}

test('older dream requests cannot replace the newest filter results', async () => {
    const { module, main, pending } = createHarness();
    const older = module.render();
    module.currentFilter.status = 'completed';
    const newer = module.render();
    assert.equal(pending[0].filters.status, 'all');
    assert.equal(pending[1].filters.status, 'completed');
    pending[1].resolve(['новая мечта']);
    await newer;
    pending[0].resolve(['старая мечта']);
    await older;
    assert.equal(main.innerHTML, 'Результат: новая мечта');
});

test('stale errors and navigation away cannot overwrite the current page', async () => {
    const { module, main, pending, window } = createHarness();
    const older = module.render();
    const newer = module.render();
    pending[1].resolve(['актуальная мечта']);
    await newer;
    pending[0].reject(new Error('сеть'));
    await older;
    assert.equal(main.innerHTML, 'Результат: актуальная мечта');

    const leaving = module.render();
    main.innerHTML = 'Другая страница';
    pending[2].resolve(['невидимая мечта']);
    await leaving;
    assert.equal(main.innerHTML, 'Другая страница');

    const anotherUser = module.render();
    window.app.currentUser = { uid: 'bob' };
    pending[3].resolve(['чужая мечта']);
    await anotherUser;
    assert.notEqual(main.innerHTML, 'Результат: чужая мечта');
});
