import test from 'node:test';
import assert from 'node:assert/strict';
import { RegistrationRecoveryModule } from '../js/modules/auth/registration-recovery.js';

function element(value = '') {
    const classes = new Set(['d-none']);
    const listeners = new Map();
    const attrs = new Map();
    return {
        value, disabled: false, isConnected: true, focused: false, textContent: '',
        classList: {
            add(name) { classes.add(name); },
            remove(name) { classes.delete(name); },
            contains(name) { return classes.has(name); }
        },
        setAttribute(name, value) { attrs.set(name, value); },
        removeAttribute(name) { attrs.delete(name); },
        getAttribute(name) { return attrs.get(name); },
        focus() { this.focused = true; },
        addEventListener(name, callback) { listeners.set(name, callback); },
        async fire(name) { return listeners.get(name)?.({ preventDefault() {} }); }
    };
}

function setup(service, onComplete = async () => {}) {
    const nodes = new Map([
        ['#recoverySignOut', element()],
        ['#recoveryForm', element()],
        ['#recoveryUsername', element('alice_123')],
        ['#recoveryError', element()],
        ['#recoverySubmit', element()]
    ]);
    const container = {
        innerHTML: '',
        querySelector(selector) { return nodes.get(selector); }
    };
    const previousDocument = globalThis.document;
    const previousWindow = globalThis.window;
    globalThis.document = { getElementById: () => container };
    globalThis.window = { app: { registrationRecoveryStatus: 'needs-profile' } };
    new RegistrationRecoveryModule(service, onComplete).render();
    return {
        nodes,
        restore() {
            globalThis.document = previousDocument;
            globalThis.window = previousWindow;
        }
    };
}

test('recovery rejects invalid nickname before network request', async () => {
    let calls = 0;
    const ui = setup({ recoverRegistrationV2: async () => { calls++; } });
    try {
        ui.nodes.get('#recoveryUsername').value = 'a!';
        await ui.nodes.get('#recoveryForm').fire('submit');
        assert.equal(calls, 0);
        assert.equal(ui.nodes.get('#recoveryUsername').focused, true);
        assert.equal(ui.nodes.get('#recoveryError').classList.contains('d-none'), false);
    } finally { ui.restore(); }
});

test('recovery suppresses overlapping submissions and permits retry after a failure', async () => {
    let calls = 0;
    let release;
    const ui = setup({
        recoverRegistrationV2: async () => {
            calls++;
            if (calls === 1) return new Promise(resolve => { release = resolve; });
            return { success: true };
        }
    });
    try {
        const form = ui.nodes.get('#recoveryForm');
        const button = ui.nodes.get('#recoverySubmit');
        const first = form.fire('submit');
        assert.equal(button.disabled, true);
        assert.equal(button.getAttribute('aria-busy'), 'true');
        await form.fire('submit');
        assert.equal(calls, 1);
        release({ success: false, error: 'Попробуй позже' });
        await first;
        assert.equal(button.disabled, false);
        assert.equal(button.getAttribute('aria-busy'), undefined);
        assert.equal(ui.nodes.get('#recoveryError').textContent, 'Попробуй позже');
        await form.fire('submit');
        assert.equal(calls, 2);
    } finally { ui.restore(); }
});

test('network rejection restores recovery button and reports error', async () => {
    const ui = setup({ recoverRegistrationV2: async () => { throw new Error('offline'); } });
    try {
        await ui.nodes.get('#recoveryForm').fire('submit');
        assert.equal(ui.nodes.get('#recoverySubmit').disabled, false);
        assert.match(ui.nodes.get('#recoveryError').textContent, /подключение/);
    } finally { ui.restore(); }
});

test('failed sign-out can be retried without leaving control disabled', async () => {
    let calls = 0;
    const ui = setup({
        signOut: async () => {
            calls++;
            if (calls === 1) throw new Error('offline');
        }
    });
    try {
        const button = ui.nodes.get('#recoverySignOut');
        await button.fire('click');
        assert.equal(button.disabled, false);
        assert.equal(button.getAttribute('aria-busy'), undefined);
        assert.match(ui.nodes.get('#recoveryError').textContent, /Не удалось выйти/);
        await button.fire('click');
        assert.equal(calls, 2);
    } finally { ui.restore(); }
});
