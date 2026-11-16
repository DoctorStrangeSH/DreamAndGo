import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/dreams/dreams.js', import.meta.url), 'utf8');
const start = source.indexOf("document.getElementById('saveDreamBtn').addEventListener('click', async (event) => {");
const bodyStart = source.indexOf('async (event) => {', start);
const bodyEnd = source.indexOf('\n        });\n    }', bodyStart);
assert.ok(start >= 0 && bodyStart >= 0 && bodyEnd > bodyStart, 'save handler must exist');
const handlerSource = source.slice(bodyStart, bodyEnd) + '\n}';

function makeHarness(save) {
    const state = { calls: 0, toasts: [], renders: 0 };
    const buttonAttributes = new Map();
    const button = {
        disabled: false, isConnected: true,
        setAttribute(name, value) { buttonAttributes.set(name, value); },
        removeAttribute(name) { buttonAttributes.delete(name); },
        getAttribute(name) { return buttonAttributes.get(name); }
    };
    const document = {
        getElementById(id) {
            assert.equal(id, 'dreamForm');
            return {};
        },
        querySelectorAll() { return []; }
    };
    const window = {
        app: {
            ui: { showToast(message) { state.toasts.push(message); } },
            onUserAction() {}
        }
    };
    const FormData = class {
        get(key) {
            return {
                title: 'Моя мечта', category: 'Знания', status: 'dreaming',
                description: '', progress: '0', deadline: ''
            }[key];
        }
    };
    const module = {
        dreamsService: {
            async addDream() { state.calls++; return save(); }
        },
        async render() { state.renders++; }
    };
    let hidden = false;
    const handler = new Function(
        'document', 'window', 'FormData', 'userId', 'dreamId', 'isEdit',
        'modal', 'setTimeout', 'console',
        `return (${handlerSource});`
    )(document, window, FormData, 'alice', null, false,
        { hide() { hidden = true; } }, () => {}, { error() {} });
    return { state, button, handler: event => handler.call(module, event), wasHidden: () => hidden };
}

test('double click while saving a dream sends only one write', async () => {
    let resolveSave;
    const harness = makeHarness(() => new Promise(resolve => { resolveSave = resolve; }));
    const event = { currentTarget: harness.button };
    const first = harness.handler(event);
    assert.equal(harness.button.disabled, true);
    assert.equal(harness.button.getAttribute('aria-busy'), 'true');
    await harness.handler(event);
    assert.equal(harness.state.calls, 1);
    resolveSave({ success: true });
    await first;
    assert.equal(harness.button.disabled, false);
    assert.equal(harness.wasHidden(), true);
});

test('failed save unlocks the form for retry', async () => {
    let attempts = 0;
    const harness = makeHarness(async () => {
        attempts++;
        if (attempts === 1) throw new Error('offline');
        return { success: true };
    });
    const event = { currentTarget: harness.button };
    await harness.handler(event);
    assert.equal(harness.button.disabled, false);
    assert.equal(harness.button.getAttribute('aria-busy'), undefined);
    assert.match(harness.state.toasts[0], /подключение/);
    await harness.handler(event);
    assert.equal(harness.state.calls, 2);
    assert.equal(harness.wasHidden(), true);
});
