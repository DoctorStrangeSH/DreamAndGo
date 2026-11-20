import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const moduleSource = readFileSync(new URL('../js/modules/dreams/dreams.js', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('../js/services/dreams.service.js', import.meta.url), 'utf8');

function extract(source, start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from, 'expected method exists');
    return source.slice(from, to);
}

const renderMethod = extract(moduleSource, '    async render() {', '    getTemplate(');
const getDreamsMethod = extract(serviceSource, '    async getDreams(', '    async addDream(');

test('dreams service exposes Firestore load errors when requested', async () => {
    const Service = new Function('collection', 'query', 'orderBy', 'where', 'getDocs', 'console', 'isAuthenticatedOwner', 'auth',
        `return class Service { constructor() { this.db = {}; } ${getDreamsMethod} }`
    )(
        () => ({}), (...args) => args, () => ({}), () => ({}),
        async () => { throw new Error('offline'); }, { error() {} },
        (requestedUid, activeUid) => requestedUid === activeUid,
        { currentUser: { uid: 'alice' } }
    );
    const service = new Service();
    assert.deepEqual(await service.getDreams('alice'), []);
    await assert.rejects(service.getDreams('alice', {}, { throwOnError: true }), /offline/);
});

test('dreams render offers retry rather than displaying an empty library on failure', async () => {
    let retryCallback;
    const mainContent = {
        innerHTML: '',
        querySelector(selector) {
            if (selector.startsWith('[data-collection-request=')) {
                return this.innerHTML.includes(selector.slice(1, -1)) ? {} : null;
            }
            assert.equal(selector, '#retryDreamsLoad');
            return { addEventListener(_event, callback) { retryCallback = callback; } };
        }
    };
    const document = { getElementById: () => mainContent };
    const window = {
        app: {
            currentUser: { uid: 'alice' },
            ui: { createLoader: () => 'Loading...' }
        }
    };
    const state = { calls: 0 };
    const Module = new Function('document', 'window', 'console', 'state',
        `return class Module {
            constructor() {
                this.currentFilter = {};
                this.requestId = 0;
                this.dreamsService = { async getDreams() {
                    state.calls++;
                    if (state.calls === 1) throw new Error('offline');
                    return [{ id: 'dream1' }];
                } };
            }
            getTemplate(dreams) { return 'Loaded ' + dreams.length; }
            attachEventListeners() {}
            ${renderMethod}
        }`
    )(document, window, { error() {} }, state);
    const module = new Module();
    await module.render();
    assert.match(mainContent.innerHTML, /Не удалось загрузить мечты/);
    assert.equal(typeof retryCallback, 'function');
    await retryCallback();
    assert.equal(mainContent.innerHTML, 'Loaded 1');
});
