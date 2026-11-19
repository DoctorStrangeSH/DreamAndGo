import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/core/ui-components.js', import.meta.url), 'utf8');
const methodStart = source.indexOf('    showToast(message, type = ');
const methodEnd = source.indexOf('    // Спиннер загрузки', methodStart);
assert.ok(methodStart >= 0 && methodEnd > methodStart);
const method = source.slice(methodStart, methodEnd);

function createHarness() {
    const toasts = [];
    const container = {
        isConnected: true,
        className: '',
        insertAdjacentHTML(_position, html) { this.lastHTML = html; },
        querySelector(selector) {
            assert.ok(this.lastHTML.includes(selector.slice(1)));
            return { addEventListener() {}, remove() {} };
        }
    };
    const document = {
        body: { appendChild() {} },
        createElement: () => container
    };
    const bootstrap = { Toast: class {
        constructor(_element, config) { toasts.push({ html: container.lastHTML, config }); }
        show() {}
    } };
    const Component = new Function('document', 'bootstrap', 'escapeHTML', `
        return class Component {
            constructor() { this.toastContainer = null; this.toastSequence = 0; }
            ${method}
        };
    `)(document, bootstrap, value => String(value).replaceAll('<', '&lt;'));
    return { component: new Component(), toasts };
}

test('two notifications in the same millisecond have distinct IDs', () => {
    const { component, toasts } = createHarness();
    component.showToast('Готово');
    component.showToast('Сохранено');
    const ids = toasts.map(toast => toast.html.match(/id="(toast-[^"]+)"/)[1]);
    assert.notEqual(ids[0], ids[1]);
    assert.match(toasts[0].html, /role="status" aria-live="polite"/);
});

test('errors stay visible longer and have an accessible close action', () => {
    const { component, toasts } = createHarness();
    component.showToast('<Ошибка>', 'error');
    assert.match(toasts[0].html, /role="alert" aria-live="assertive"/);
    assert.match(toasts[0].html, /Закрыть уведомление/);
    assert.match(toasts[0].html, /&lt;Ошибка>/);
    assert.equal(toasts[0].config.delay, 6000);
});

test('unsupported notification type falls back to an informational style', () => {
    const { component, toasts } = createHarness();
    component.showToast('Новость', 'unknown');
    assert.match(toasts[0].html, /text-bg-primary/);
    assert.doesNotMatch(toasts[0].html, /undefined/);
});
