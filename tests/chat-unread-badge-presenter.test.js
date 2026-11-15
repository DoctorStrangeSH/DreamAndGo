import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatUnreadBadgePresenter } from '../js/core/chat-unread-badge-presenter.js';
import { ChatUnreadController } from '../js/core/chat-unread-controller.js';

const slot = () => ({ innerHTML: '' });

test('controller update renders only the matching dedicated chat slot', async () => {
    const first = slot(), second = slot();
    const slots = new Map([['a', first], ['b', second]]);
    const presenter = new ChatUnreadBadgePresenter(id => slots.get(id));
    const controller = new ChatUnreadController(async ({ chatId }) => ({
        chatId, unread: chatId === 'a' ? 3 : 0
    }), (state, id) => presenter.onChange(state, id));
    await controller.refresh('a');
    assert.match(first.innerHTML, />3<\/span>/);
    assert.equal(second.innerHTML, '');
    await controller.refresh('b');
    assert.equal(second.innerHTML, '');
    assert.match(first.innerHTML, />3<\/span>/);
});

test('replacing card nodes removes obsolete badge and updates current slot', () => {
    const oldSlot = slot(), newSlot = slot();
    let current = oldSlot;
    const presenter = new ChatUnreadBadgePresenter(() => current);
    presenter.onChange({ chatId: 'a', status: 'ready', unread: 2 }, 'a');
    assert.match(oldSlot.innerHTML, />2<\/span>/);
    current = newSlot;
    presenter.onChange({ chatId: 'a', status: 'ready', unread: 5 }, 'a');
    assert.equal(oldSlot.innerHTML, '');
    assert.match(newSlot.innerHTML, />5<\/span>/);
});

test('account clear and dialog removal erase old private indicators', () => {
    const first = slot(), second = slot();
    const presenter = new ChatUnreadBadgePresenter(id => id === 'a' ? first : second);
    presenter.onChange({ chatId: 'a', status: 'ready', unread: 2 }, 'a');
    presenter.onChange({ chatId: 'b', status: 'ready', unread: 4 }, 'b');
    presenter.onChange(null, 'a');
    assert.equal(first.innerHTML, '');
    assert.notEqual(second.innerHTML, '');
    presenter.onChange(null, null);
    assert.equal(second.innerHTML, '');
});

test('mismatched and malicious chat IDs cannot influence another badge', () => {
    const owned = slot();
    const presenter = new ChatUnreadBadgePresenter(id => id === 'a' ? owned : null);
    presenter.onChange({ chatId: 'other', status: 'ready', unread: 2 }, 'a');
    assert.equal(owned.innerHTML, '');
    presenter.onChange({ chatId: 'a', status: 'ready', unread: '<img>' }, 'a');
    assert.equal(owned.innerHTML, '');
});
