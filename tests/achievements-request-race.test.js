import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/achievements/achievements.js', import.meta.url), 'utf8');
const service = readFileSync(new URL('../js/services/achievements.service.js', import.meta.url), 'utf8');
const from = source.indexOf('    async render() {');
const to = source.indexOf('    getTemplate(', from);
assert.ok(from >= 0 && to > from);

function harness() {
    const pending = [];
    const callbacks = {};
    const mc = {
        innerHTML: '', isConnected: true,
        querySelector(selector) {
            if (selector.startsWith('[data-achievements-request=')) {
                return this.innerHTML.includes(selector.slice(1, -1)) ? {} : null;
            }
            return { addEventListener(_name, handler) { callbacks[selector] = handler; } };
        }
    };
    const document = { getElementById: () => mc };
    const window = { app: { currentUser: { uid: 'alice' }, userData: { stats: {} }, ui: { createLoader: () => 'Loading' } } };
    const Module = new Function('document', 'window', 'console', 'pending', `return class Module {
        constructor() {
            this.requestId = 0;
            this.achievementsService = {
                getUserAchievements: (uid, options) => new Promise((resolve, reject) => pending.push({ uid, options, resolve, reject })),
                getAllAchievements: () => []
            };
        }
        getTemplate(earned) { return 'Награды: ' + earned.join(','); }
        attachListeners() {}
        ${source.slice(from, to)}
    }`)(document, window, { error() {} }, pending);
    return { module: new Module(), mc, window, pending, callbacks };
}

test('achievements ignore old responses after switching accounts', async () => {
    const { module, mc, window, pending } = harness();
    const loading = module.render();
    assert.equal(pending[0].uid, 'alice');
    assert.equal(pending[0].options.throwOnError, true);
    window.app.currentUser = { uid: 'bob' };
    pending[0].resolve(['Чужое достижение']);
    await loading;
    assert.match(mc.innerHTML, /Loading/);
});

test('achievements ignore outdated requests and pages', async () => {
    const { module, mc, pending } = harness();
    const old = module.render();
    const current = module.render();
    pending[1].resolve(['Новое']);
    await current;
    pending[0].resolve(['Старое']);
    await old;
    assert.equal(mc.innerHTML, 'Награды: Новое');

    const leaving = module.render();
    mc.innerHTML = 'Другой раздел';
    pending[2].reject(new Error('Сеть'));
    await leaving;
    assert.equal(mc.innerHTML, 'Другой раздел');
});

test('achievement network errors show a retry instead of an empty trophy collection', async () => {
    const { module, mc, pending, callbacks } = harness();
    const loading = module.render();
    pending[0].reject(new Error('Сеть'));
    await loading;
    assert.match(mc.innerHTML, /Не удалось загрузить достижения/);
    assert.ok(callbacks['[data-retry-achievements]']);
    callbacks['[data-retry-achievements]']();
    assert.equal(pending.length, 2);
    pending[1].resolve(['Повтор']);
});

test('achievement service can propagate read failures to the UI', () => {
    assert.match(service, /getUserAchievements\(userId, \{ throwOnError = false \} = \{\}\)/);
    assert.match(service, /if \(throwOnError\) throw error/);
});
