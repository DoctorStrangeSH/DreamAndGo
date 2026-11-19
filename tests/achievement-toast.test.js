import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/core/ui-components.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/atlas-pages.css', import.meta.url), 'utf8');
const start = source.indexOf('    showAchievementToast(achievement) {');
const end = source.indexOf('    // Спиннер загрузки', start);
assert.ok(start >= 0 && end > start);

function harness(reduced = false) {
    const notifications = [];
    const container = {
        isConnected: true,
        insertAdjacentHTML(_place, html) { this.html = html; },
        querySelector(selector) {
            assert.ok(this.html.includes(selector.slice(1)));
            return { addEventListener() {}, remove() {} };
        }
    };
    const bootstrap = { Toast: class {
        constructor(_element, config) { notifications.push({ html: container.html, config }); }
        show() {}
    } };
    const document = { createElement: () => container, body: { appendChild() {} } };
    const window = { matchMedia: () => ({ matches: reduced }) };
    const escapeHTML = value => String(value).replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    const Component = new Function('document', 'window', 'bootstrap', 'escapeHTML', `return class Component {
        constructor() { this.toastContainer = null; this.toastSequence = 0; }
        ${source.slice(start, end)}
    }`)(document, window, bootstrap, escapeHTML);
    return { component: new Component(), notifications };
}

test('award toast escapes profile text, is accessible, and uses unique IDs', () => {
    const { component, notifications } = harness();
    const award = { emoji: '<img src=x>', title: '<script>alert(1)</script>', description: 'Победа "ура"', level: 4 };
    component.showAchievementToast(award);
    component.showAchievementToast(award);
    assert.equal(notifications.length, 2);
    assert.match(notifications[0].html, /atlas-achievement-toast--legendary/);
    assert.match(notifications[0].html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(notifications[0].html, /&lt;img src=x&gt;/);
    assert.match(notifications[0].html, /role="status" aria-live="polite"/);
    assert.match(notifications[0].html, /href="#achievements"/);
    assert.notEqual(notifications[0].html.match(/id="(achievement-toast-[^"]+)"/)[1],
        notifications[1].html.match(/id="(achievement-toast-[^"]+)"/)[1]);
    assert.equal(notifications[0].config.animation, true);
});

test('award toast honors reduced motion and is wired into achievement awarding', () => {
    const { component, notifications } = harness(true);
    component.showAchievementToast({ title: 'Первый шаг', level: 1 });
    assert.equal(notifications[0].config.animation, false);
    assert.match(notifications[0].html, /atlas-achievement-toast--bronze/);
    assert.match(app, /newAchievements\.forEach\(a => this\.ui\.showAchievementToast\(a\)\)/);
    assert.match(css, /\.atlas-achievement-toast--legendary::before/);
});
