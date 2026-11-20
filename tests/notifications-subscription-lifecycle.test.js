import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/notifications/notifications-widget.js', import.meta.url), 'utf8');
const initStart = source.indexOf('    init() {');
const initEnd = source.indexOf('    updateBadge(', initStart);
const destroyStart = source.indexOf('    destroy() {');
const destroyEnd = source.indexOf('\n    }', destroyStart) + 6;
assert.ok(initStart >= 0 && initEnd > initStart && destroyStart >= 0 && destroyEnd > destroyStart);

function harness() {
    const callbacks = [];
    const subscriptions = [];
    const rendered = [];
    const window = {
        app: {
            currentUser: { uid: 'alice' },
            notificationsService: {
                subscribeToNotifications(uid, callback) {
                    const subscription = { uid, callback, unsubscribed: false };
                    subscriptions.push(subscription);
                    return () => { subscription.unsubscribed = true; };
                }
            }
        }
    };
    const Widget = new Function('window', 'rendered', 'callbacks', `return class Widget {
        constructor() {
            this.unsubscribe = null;
            this.subscriptionGeneration = 0;
            this.ownerUid = null;
        }
        renderDropdown(items) { rendered.push(items); }
        updateBadge(items) { callbacks.push(items); }
        ${source.slice(initStart, initEnd)}
        ${source.slice(destroyStart, destroyEnd)}
    }`)(window, rendered, callbacks);
    return { widget: new Widget(), window, subscriptions, rendered, callbacks };
}

test('notification widget replaces an existing subscription on re-init', () => {
    const { widget, subscriptions } = harness();
    widget.init();
    widget.init();
    assert.equal(subscriptions.length, 2);
    assert.equal(subscriptions[0].unsubscribed, true);
    assert.equal(subscriptions[1].unsubscribed, false);
});

test('queued snapshots from an old account cannot render after account switch', () => {
    const { widget, window, subscriptions, rendered, callbacks } = harness();
    widget.init();
    window.app.currentUser = { uid: 'bob' };
    widget.init();
    subscriptions[0].callback([{ id: 'private-alice', title: 'Old account' }]);
    subscriptions[1].callback([{ id: 'bob-notice', title: 'Current account' }]);
    assert.deepEqual(rendered, [[{ id: 'bob-notice', title: 'Current account' }]]);
    assert.deepEqual(callbacks, [[{ id: 'bob-notice', title: 'Current account' }]]);
    assert.equal(subscriptions[0].unsubscribed, true);
});

test('destroy unsubscribes and invalidates already queued callbacks', () => {
    const { widget, subscriptions, rendered, callbacks } = harness();
    widget.init();
    widget.destroy();
    subscriptions[0].callback([{ id: 'late', title: 'Late snapshot' }]);
    assert.equal(subscriptions[0].unsubscribed, true);
    assert.equal(widget.ownerUid, null);
    assert.deepEqual(rendered, []);
    assert.deepEqual(callbacks, []);
});

test('malformed notification snapshots are normalized to an empty list', () => {
    const { widget, subscriptions, rendered } = harness();
    widget.init();
    subscriptions[0].callback(null);
    assert.deepEqual(rendered, [[]]);
});
