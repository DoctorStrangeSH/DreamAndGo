import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/friends/friends.js', import.meta.url), 'utf8');
const subscriptions = source.slice(source.indexOf('    subscribeToFriends() {'), source.indexOf('    createCard(', source.indexOf('    subscribeToFriends() {')));
const stop = source.slice(source.indexOf('    stopSubscriptions() {'), source.lastIndexOf('\n}'));

function harness() {
    const handlers = [];
    const list = { innerHTML: '', isConnected: true };
    const document = { getElementById: () => list };
    const realtimeService = {};
    for (const name of ['subscribeToFriends', 'subscribeToFriendRequests', 'subscribeToSentRequests']) {
        realtimeService[name] = (uid, fn) => {
            const entry = { uid, fn, unsubscribed: false };
            handlers.push(entry);
            return () => { entry.unsubscribed = true; };
        };
    }
    const window = { app: { currentUser: { uid: 'alice' }, ui: { createLoader: () => 'Loading' }, realtimeService } };
    const Module = new Function('document', 'window', `return class Module {
        constructor() {
            this.ownerUid = 'alice'; this.currentTab = 'friends';
            this.subscriptionVersions = { friends: 0, requests: 0, sent: 0 };
            this.unsubscribeFriends = this.unsubscribeRequests = this.unsubscribeSent = null;
        }
        createCard(user) { return '[' + user.username + ']'; }
        attachCardListeners() {}
        ${subscriptions}
        ${stop}
    }`)(document, window);
    return { module: new Module(), handlers, list, window };
}

test('friend realtime updates stop after account switching', () => {
    const { module, handlers, list, window } = harness();
    module.subscribeToFriends();
    handlers[0].fn([{ username: 'Новый друг' }]);
    assert.equal(list.innerHTML, '[Новый друг]');
    window.app.currentUser = { uid: 'bob' };
    handlers[0].fn([{ username: 'Старый аккаунт' }]);
    assert.equal(list.innerHTML, '[Новый друг]');
    module.subscribeToFriends();
    assert.equal(handlers.length, 1);
});

test('replaced subscriptions cannot publish stale same-tab updates', () => {
    const { module, handlers, list } = harness();
    module.subscribeToFriends();
    module.subscribeToFriends();
    assert.equal(handlers[0].unsubscribed, true);
    handlers[1].fn([{ username: 'Актуальный' }]);
    handlers[0].fn([{ username: 'Устаревший' }]);
    assert.equal(list.innerHTML, '[Актуальный]');
});

test('subscriptions for independent tabs do not invalidate each other', () => {
    const { module, handlers, list } = harness();
    module.subscribeToFriends();
    module.subscribeToRequests();
    module.currentTab = 'friends';
    handlers[0].fn([{ username: 'Друг' }]);
    assert.equal(list.innerHTML, '[Друг]');
    module.currentTab = 'requests';
    handlers[1].fn([{ username: 'Заявка' }]);
    assert.equal(list.innerHTML, '[Заявка]');
    module.stopSubscriptions();
    assert.equal(handlers[0].unsubscribed, true);
    assert.equal(handlers[1].unsubscribed, true);
    handlers[1].fn([{ username: 'Поздняя заявка' }]);
    assert.equal(list.innerHTML, '[Заявка]');
});

test('friend search checks owner identity on success and failure', () => {
    const block = source.slice(source.indexOf('    async searchUser() {'), source.indexOf('    attachCardListeners() {'));
    assert.equal((block.match(/userId !== this\.ownerUid/g) || []).length, 2);
    assert.match(source, /this\.stopSubscriptions\(\);\s*this\.searchVersion\+\+/);
});
