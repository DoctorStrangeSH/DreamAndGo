import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/friends/friends.js', import.meta.url), 'utf8');
const from = source.indexOf('    async runFriendAction(');
const to = source.indexOf('    destroy() {', from);
assert.ok(from >= 0 && to > from);

function harness() {
    const messages = [];
    const window = { app: { currentUser: { uid: 'alice' }, ui: { showToast: (...args) => messages.push(args) } } };
    const Module = new Function('window', 'console', `return class Module {
        constructor() { this.ownerUid = 'alice'; }
        ${source.slice(from, to)}
    }`)(window, { error() {} });
    const attrs = new Set();
    const btn = {
        innerHTML: 'Добавить', disabled: false, isConnected: true,
        setAttribute: attr => attrs.add(attr), removeAttribute: attr => attrs.delete(attr)
    };
    return { module: new Module(), window, messages, btn, attrs };
}

test('friend action blocks double clicks and resets loading after success', async () => {
    const { module, btn, attrs, messages } = harness();
    let resolve;
    let calls = 0;
    const perform = () => { calls++; return new Promise(r => { resolve = r; }); };
    const first = module.runFriendAction(btn, perform, 'Готово', 'Ошибка');
    await module.runFriendAction(btn, perform, 'Готово', 'Ошибка');
    assert.equal(calls, 1);
    assert.equal(btn.disabled, true);
    assert.equal(attrs.has('aria-busy'), true);
    resolve({ success: true });
    await first;
    assert.equal(btn.disabled, false);
    assert.equal(attrs.has('aria-busy'), false);
    assert.deepEqual(messages, [['Готово', 'success']]);
});

test('friend action ignores responses after account switches', async () => {
    const { module, btn, window, messages } = harness();
    let resolve;
    const request = module.runFriendAction(btn, () => new Promise(r => { resolve = r; }), 'Готово', 'Ошибка');
    window.app.currentUser = { uid: 'bob' };
    resolve({ success: true });
    await request;
    assert.deepEqual(messages, []);
    assert.equal(btn.disabled, false);
});

test('friend action retries after failure or rejection and keeps sent button disabled', async () => {
    const { module, btn, messages } = harness();
    await module.runFriendAction(btn, async () => ({ success: false }), 'Готово', 'Не удалось');
    assert.equal(btn.disabled, false);
    await module.runFriendAction(btn, async () => { throw new Error('Network'); }, 'Готово', 'Сеть');
    assert.equal(btn.disabled, false);
    await module.runFriendAction(btn, async () => ({ success: true }), 'Отправлено', 'Ошибка', null,
        { keepDisabledOnSuccess: true });
    assert.equal(btn.disabled, true);
    assert.deepEqual(messages.map(message => message[0]), ['Не удалось', 'Сеть', 'Отправлено']);
});

test('all five friend actions share guarded owner-scoped execution', () => {
    const listeners = source.slice(source.indexOf('    attachCardListeners() {'), from);
    assert.equal((listeners.match(/this\.runFriendAction\(btn,/g) || []).length, 5);
    assert.doesNotMatch(listeners, /window\.app\.currentUser\.uid, btn\.dataset\.uid/);
});
