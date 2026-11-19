import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/settings/settings.js', import.meta.url), 'utf8');
const from = source.indexOf('    async render() {');
const to = source.indexOf('    async saveSettings(', from);
assert.ok(from >= 0 && to > from);

function harness() {
    const pending = [];
    const handlers = {};
    const mc = {
        innerHTML: '', isConnected: true,
        querySelector(selector) {
            if (selector.startsWith('[data-settings-request=')) {
                return this.innerHTML.includes(selector.slice(1, -1)) ? {} : null;
            }
            return { addEventListener(_event, fn) { handlers[selector] = fn; } };
        }
    };
    const document = {
        getElementById: id => id === 'main-content' ? mc : { addEventListener() {} },
        querySelectorAll: () => []
    };
    const window = { app: { currentUser: { uid: 'alice' }, ui: { createLoader: () => 'Loading' } } };
    const Module = new Function('document', 'window', 'console', 'pending', 'doc', 'db', 'getDoc', 'escapeHTML', `return class Module {
        constructor() { this.requestId = 0; }
        ${source.slice(from, to)}
    }`)(document, window, { error() {} }, pending, (_db, _collection, uid) => uid, {},
        () => new Promise((resolve, reject) => pending.push({ resolve, reject })), value => String(value));
    return { module: new Module(), mc, pending, window, handlers };
}

test('settings ignore results after account switches', async () => {
    const { module, mc, pending, window } = harness();
    const loading = module.render();
    window.app.currentUser = { uid: 'bob' };
    pending[0].resolve({ exists: () => true, data: () => ({ displayName: 'Alice' }) });
    await loading;
    assert.match(mc.innerHTML, /Loading/);
    assert.doesNotMatch(mc.innerHTML, /Alice/);
});

test('settings ignore outdated failures and navigation away', async () => {
    const { module, mc, pending } = harness();
    const old = module.render();
    const current = module.render();
    pending[1].resolve({ exists: () => false });
    await current;
    pending[0].reject(new Error('Old request'));
    await old;
    assert.match(mc.innerHTML, /profileSettingsForm/);
    const leaving = module.render();
    mc.innerHTML = 'Другая страница';
    pending[2].reject(new Error('Network'));
    await leaving;
    assert.equal(mc.innerHTML, 'Другая страница');
});

test('settings show retry for connection failures', async () => {
    const { module, mc, pending, handlers } = harness();
    const loading = module.render();
    pending[0].reject(new Error('Offline'));
    await loading;
    assert.match(mc.innerHTML, /Не удалось загрузить настройки/);
    assert.ok(handlers['[data-retry-settings]']);
    handlers['[data-retry-settings]']();
    assert.equal(pending.length, 2);
    pending[1].resolve({ exists: () => false });
});

test('settings writes and exports are tied to the owning account', () => {
    assert.match(source, /form\.dataset\.settingsOwner !== uid/);
    assert.match(source, /doc\(db, 'users', uid\)/);
    assert.match(source, /window\.app\.currentUser\?\.uid !== uid \|\| !form\.isConnected/);
    assert.match(source, /uid !== userId \|\| !btn \|\| btn\.disabled/);
    assert.match(source, /finally \{[\s\S]*?submitBtn\.disabled = false/);
});
