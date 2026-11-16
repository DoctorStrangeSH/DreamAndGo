import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/dreams/dreams.js', import.meta.url), 'utf8');
const region = source.slice(source.indexOf("document.querySelectorAll('.delete-btn')"));
const start = region.indexOf('async (e) => {');
const end = region.indexOf('\n            });', start);
assert.ok(start >= 0 && end > start, 'dream deletion callback exists');
const handlerSource = region.slice(start, end)
    .replace(/^async \(e\) =>/, 'async function(e)') + '\n}';

function harness(remove) {
    let resolveDelete;
    const state = { calls: 0, renders: 0, refreshes: 0, toasts: [] };
    const attributes = new Map();
    const btn = {
        disabled: false, isConnected: true, dataset: { id: 'dream1' },
        setAttribute(name, value) { attributes.set(name, value); },
        removeAttribute(name) { attributes.delete(name); },
        getAttribute(name) { return attributes.get(name); }
    };
    const window = {
        app: {
            currentUser: { uid: 'alice' },
            ui: { showToast(message) { state.toasts.push(message); } },
            refreshUserData() { state.refreshes++; }
        }
    };
    const module = {
        dreamsService: { async deleteDream() { state.calls++; return remove(); } },
        async render() { state.renders++; }
    };
    const handler = new Function('btn', 'window', 'confirm', 'console',
        `return (${handlerSource});`
    )(btn, window, () => true, { error() {} });
    return { btn, state, handler: () => handler.call(module, { stopPropagation() {} }) };
}

test('double delete click results in a single request', async () => {
    let finish;
    const ui = harness(() => new Promise(resolve => { finish = resolve; }));
    const first = ui.handler();
    assert.equal(ui.btn.disabled, true);
    assert.equal(ui.btn.getAttribute('aria-busy'), 'true');
    await ui.handler();
    assert.equal(ui.state.calls, 1);
    finish({ success: true });
    await first;
    assert.equal(ui.state.renders, 1);
    assert.equal(ui.state.refreshes, 1);
});

test('rejected deletion does not report success and can be retried', async () => {
    let attempts = 0;
    const ui = harness(async () => {
        attempts++;
        if (attempts === 1) throw new Error('offline');
        return { success: false };
    });
    await ui.handler();
    assert.equal(ui.btn.disabled, false);
    assert.equal(ui.btn.getAttribute('aria-busy'), undefined);
    assert.equal(ui.state.renders, 0);
    assert.match(ui.state.toasts[0], /подключение/);
    await ui.handler();
    assert.equal(ui.state.calls, 2);
    assert.equal(ui.state.renders, 0);
    assert.equal(ui.state.refreshes, 0);
    assert.equal(ui.state.toasts.some(message => message === 'Мечта удалена'), false);
});
