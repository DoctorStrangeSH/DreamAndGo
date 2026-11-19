import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatReadVisibilityTracker } from '../js/core/chat-read-visibility.js';

const id = 'a'.repeat(64);
const nextId = 'b'.repeat(64);
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(markRead = async messageId => ({ status: 'read', messageId })) {
    const elements = new Set();
    const root = { contains: element => elements.has(element) };
    const callbacks = {};
    const doc = {
        visibilityState: 'visible',
        addEventListener: (name, fn) => { callbacks[name] = fn; },
        removeEventListener: name => { delete callbacks[name]; }
    };
    let observerCallback;
    let disconnects = 0;
    const observed = new Set();
    let active = true;
    const tracker = new ChatReadVisibilityTracker({
        root, documentRef: doc, currentUserId: 'bob', markRead,
        isActive: () => active,
        observerFactory: callback => {
            observerCallback = callback;
            return {
                observe: element => observed.add(element),
                unobserve: element => observed.delete(element),
                disconnect: () => { disconnects++; observed.clear(); }
            };
        }
    });
    const element = () => {
        const el = { isConnected: true };
        elements.add(el);
        return el;
    };
    const visible = (el, ratio = 1) => observerCallback([{
        target: el, isIntersecting: ratio > 0, intersectionRatio: ratio
    }]);
    return { tracker, doc, callbacks, observed, element, visible,
        setActive: value => { active = value; }, disconnects: () => disconnects };
}

test('requires visible connected incoming message in active foreground chat', async () => {
    const calls = [];
    const h = setup(async messageId => { calls.push(messageId); return { status: 'read', messageId }; });
    const el = h.element();
    assert.equal(h.tracker.observe(el, { id, senderId: 'bob' }), false);
    assert.equal(h.tracker.observe(el, { id, senderId: 'alice', read: true }), false);
    assert.equal(h.tracker.observe(el, { id: 'bad-id', senderId: 'alice' }), false);
    assert.equal(h.tracker.observe(el, { id, senderId: 'alice' }), true);
    h.visible(el, 0.5);
    await tick();
    assert.deepEqual(calls, []);
    h.doc.visibilityState = 'hidden';
    h.visible(el, 1);
    await tick();
    assert.deepEqual(calls, []);
    h.doc.visibilityState = 'visible';
    h.setActive(false);
    h.callbacks.visibilitychange();
    await tick();
    assert.deepEqual(calls, []);
    h.setActive(true);
    h.callbacks.visibilitychange();
    await tick();
    assert.deepEqual(calls, [id]);
    h.visible(el, 1);
    await tick();
    assert.deepEqual(calls, [id]);
    h.tracker.stop();
});

test('disconnected element or stopped tracker never acknowledges unread message', async () => {
    let calls = 0;
    const h = setup(async messageId => { calls++; return { status: 'read', messageId }; });
    const el = h.element();
    h.tracker.observe(el, { id, senderId: 'alice' });
    el.isConnected = false;
    h.visible(el);
    await tick();
    assert.equal(calls, 0);
    el.isConnected = true;
    h.tracker.stop();
    h.visible(el);
    await tick();
    assert.equal(calls, 0);
    assert.equal(h.disconnects(), 1);
    assert.equal(h.callbacks.visibilitychange, undefined);
});

test('failed request does not fake read, later visible event retries same message ID', async () => {
    let calls = 0;
    const h = setup(async messageId => {
        calls++;
        if (calls === 1) throw new Error('offline');
        return { status: 'read', messageId };
    });
    const el = h.element();
    h.tracker.observe(el, { id, senderId: 'alice' });
    h.visible(el);
    await tick();
    assert.equal(calls, 1);
    h.visible(el);
    await tick();
    assert.equal(calls, 2);
    h.visible(el);
    await tick();
    assert.equal(calls, 2);
    h.tracker.stop();
});

test('rejects mismatched server receipt and deduplicates duplicate DOM elements', async () => {
    let calls = 0;
    const h = setup(async () => { calls++; return { status: 'read', messageId: nextId }; });
    const one = h.element(), two = h.element();
    h.tracker.observe(one, { id, senderId: 'alice' });
    h.tracker.observe(two, { id, senderId: 'alice' });
    h.visible(one);
    h.visible(two);
    await tick();
    assert.equal(calls, 1);
    h.visible(one);
    await tick();
    assert.equal(calls, 2);
    h.tracker.stop();
});
