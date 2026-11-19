import test from 'node:test';
import assert from 'node:assert/strict';
import { renderChatV2Pilot, ChatV2PilotView } from '../js/core/chat-v2-pilot-view.js';

const id = 'a'.repeat(64);
const uuid = '550e8400-e29b-41d4-a716-446655440000';

test('candidate pilot escapes message text and heading while rendering trusted statuses', () => {
    const html = renderChatV2Pilot({
        title: '<img src=x onerror=alert(1)>',
        userId: 'alice',
        messages: [
            { senderId: 'alice', text: '<script>bad()</script>', deliveryStatus: 'sent' },
            { senderId: 'bob', id, text: 'Привет & добро', read: false },
            { senderId: 'bob', id: 'invalid" onmouseover="oops', text: 'Без ID' }
        ]
    });
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));
    assert.ok(html.includes('Привет &amp; добро'));
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('onmouseover='), false);
    assert.equal(html.includes('data-v2-incoming-id="' + id + '"'), true);
    assert.equal((html.match(/data-v2-incoming-id=/g) || []).length, 1);
    assert.ok(html.includes('Отправлено'));
    assert.equal((html.match(/message-delivery/g) || []).length, 1);
});

test('incoming read and outgoing messages never carry a receipt observer ID', () => {
    const html = renderChatV2Pilot({
        userId: 'bob',
        messages: [
            { senderId: 'alice', text: 'Уже прочитано', id, read: true },
            { senderId: 'bob', text: 'Моё', id, read: false }
        ]
    });
    assert.equal(html.includes('data-v2-incoming-id='), false);
    assert.throws(() => renderChatV2Pilot({ userId: 'bob', messages: 'bad' }), TypeError);
});

function createHarness(sendResult) {
    const events = new Map();
    const input = { value: ' Привет ' };
    const button = { disabled: false };
    const feedback = { textContent: '' };
    const form = {
        addEventListener: (name, fn) => events.set(name, fn),
        removeEventListener: name => events.delete(name),
        querySelector: selector => selector === '[name="message"]' ? input : button
    };
    const root = {
        innerHTML: '',
        querySelector: selector => selector === '.chat-v2-pilot__composer' ? form :
            selector === '.chat-v2-pilot__feedback' ? feedback : null,
        replaceChildren() { this.innerHTML = ''; }
    };
    const intents = [];
    const session = {
        userId: 'alice',
        prepare(chatId, text) {
            intents.push({ chatId, text });
            return { clientMessageId: uuid };
        },
        send: async () => sendResult
    };
    return { root, form, events, input, button, feedback, intents, session };
}

test('pilot composer submits through the existing v2 session and clears only on acknowledgement', async () => {
    const ok = createHarness({ success: true });
    const view = new ChatV2PilotView({ root: ok.root, session: ok.session, chatId: 'chat-a', title: 'Боб' });
    view.mount();
    let prevented = false;
    await ok.events.get('submit')({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.deepEqual(ok.intents, [{ chatId: 'chat-a', text: 'Привет' }]);
    assert.equal(ok.input.value, '');
    assert.match(ok.feedback.textContent, /Отправлено/);
    assert.equal(ok.button.disabled, false);
    view.destroy();
    assert.equal(ok.events.has('submit'), false);

    const failed = createHarness({ success: false });
    const retryView = new ChatV2PilotView({
        root: failed.root, session: failed.session, chatId: 'chat-a'
    }).mount();
    await failed.events.get('submit')({ preventDefault() {} });
    assert.equal(failed.input.value, ' Привет ');
    assert.match(failed.feedback.textContent, /не подтверждена/);
    retryView.destroy();
});

test('destroyed view cannot be reused or send a message', () => {
    const h = createHarness({ success: true });
    const view = new ChatV2PilotView({ root: h.root, session: h.session, chatId: 'chat-a' }).mount();
    view.destroy();
    assert.throws(() => view.mount(), /закрыт/);
    assert.equal(h.events.size, 0);
    assert.equal(h.intents.length, 0);
});

test('pilot refreshes history exactly once after acknowledgement, never on failure', async () => {
    const ok = createHarness({ success: true });
    let refreshes = 0;
    const view = new ChatV2PilotView({
        root: ok.root, session: ok.session, chatId: 'chat-a',
        onSent: async () => { refreshes++; }
    }).mount();
    await ok.events.get('submit')({ preventDefault() {} });
    assert.equal(refreshes, 1);
    view.destroy();

    const failed = createHarness({ success: false });
    const retryView = new ChatV2PilotView({
        root: failed.root, session: failed.session, chatId: 'chat-a',
        onSent: async () => { refreshes++; }
    }).mount();
    await failed.events.get('submit')({ preventDefault() {} });
    assert.equal(refreshes, 1);
    retryView.destroy();
});

test('history refresh failure does not mislabel a confirmed message as failed', async () => {
    const h = createHarness({ success: true });
    const view = new ChatV2PilotView({
        root: h.root, session: h.session, chatId: 'chat-a',
        onSent: async () => { throw new Error('offline'); }
    }).mount();
    await h.events.get('submit')({ preventDefault() {} });
    assert.equal(h.input.value, '');
    assert.match(h.feedback.textContent, /Отправлено/);
    assert.doesNotMatch(h.feedback.textContent, /Не удалось отправить/);
    view.destroy();
});
