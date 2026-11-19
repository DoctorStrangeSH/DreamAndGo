import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/auth/auth.js', import.meta.url), 'utf8');
const start = source.indexOf('    async handleSubmit() {');
const end = source.indexOf('\n    validateUsername(', start);
assert.ok(start >= 0 && end > start, 'auth submit handler exists');
const method = source.slice(start, end);

function createHarness(mode, authService, usernameValue = 'sherlock') {
    const button = {
        disabled: false,
        isConnected: true,
        innerHTML: 'Войти',
        attrs: new Map(),
        setAttribute(name, value) { this.attrs.set(name, value); },
        removeAttribute(name) { this.attrs.delete(name); }
    };
    const username = { value: usernameValue, focused: false, focus() { this.focused = true; } };
    const fields = {
        email: { value: '  user@example.com  ' },
        password: { value: 'password123' },
        username
    };
    const document = {
        getElementById: name => fields[name] ?? null,
        querySelector: selector => selector === '#authForm button[type="submit"]' ? button : null
    };
    const Auth = new Function('document', 'window', 'console', `
        return class Auth {
            constructor() { this.mode = 'login'; this.messages = []; this.authService = null; }
            ${method}
            validateUsername(name) { return /^[A-Za-z0-9_]{3,20}$/.test(name); }
            showError(message) { this.messages.push(message); }
            hideError() { this.messages.push('cleared'); }
        };
    `)(document, {}, { error() {} });
    const module = new Auth();
    module.mode = mode;
    module.authService = authService;
    return { module, button, username, fields };
}

test('auth network failures restore submit button and allow retry', async () => {
    let calls = 0;
    const ui = createHarness('login', {
        async signInWithEmail() {
            calls++;
            if (calls === 1) throw new Error('offline');
            return { success: false, error: 'Неверные данные' };
        }
    });
    await ui.module.handleSubmit();
    assert.equal(ui.button.disabled, false);
    assert.equal(ui.button.innerHTML, 'Войти');
    assert.equal(ui.button.attrs.has('aria-busy'), false);
    assert.match(ui.module.messages.at(-1), /Проверь интернет/);
    await ui.module.handleSubmit();
    assert.equal(calls, 2);
    assert.equal(ui.button.disabled, false);
    assert.equal(ui.module.messages.at(-1), 'Неверные данные');
});

test('invalid or missing nickname never locks registration button', async () => {
    const ui = createHarness('register', { async signUpWithEmail() { throw new Error('must not call'); } }, '   ');
    await ui.module.handleSubmit();
    assert.equal(ui.button.disabled, false);
    assert.equal(ui.username.focused, true);
    assert.match(ui.module.messages.at(-1), /Никнейм/);

    delete ui.fields.username;
    await ui.module.handleSubmit();
    assert.equal(ui.button.disabled, false);
    assert.match(ui.module.messages.at(-1), /не найдено/);
});

test('in-flight auth request cannot be submitted twice', async () => {
    let finish;
    let calls = 0;
    const ui = createHarness('login', {
        signInWithEmail() {
            calls++;
            return new Promise(resolve => { finish = resolve; });
        }
    });
    const pending = ui.module.handleSubmit();
    assert.equal(ui.button.disabled, true);
    assert.equal(ui.button.attrs.get('aria-busy'), 'true');
    await ui.module.handleSubmit();
    assert.equal(calls, 1);
    finish({ success: true });
    await pending;
    assert.equal(ui.button.disabled, false);
    assert.equal(ui.button.attrs.has('aria-busy'), false);
});
