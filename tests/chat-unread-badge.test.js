import test from 'node:test';
import assert from 'node:assert/strict';
import { getChatUnreadDisplay, renderChatUnreadBadge } from '../js/core/chat-unread-badge.js';

test('confirmed unread counts render compact number with complete accessible label', () => {
    for (const count of [1, 4, 99, 100, 150]) {
        const state = { status: 'ready', unread: count };
        const html = renderChatUnreadBadge(state);
        assert.ok(html.includes(`Непрочитанных сообщений: ${count}`));
        assert.ok(html.includes(count > 99 ? '>99+<' : `>${count}<`));
        assert.ok(html.includes('role="status"'));
    }
    assert.equal(renderChatUnreadBadge({ status: 'ready', unread: 0 }), '');
});

test('loading and offline states never display stale numbers', () => {
    assert.match(renderChatUnreadBadge({ status: 'checking', unread: 98 }), /Проверяем непрочитанные/);
    assert.match(renderChatUnreadBadge({ status: 'unknown', unread: 98 }), /Проверка недоступна/);
    assert.equal(renderChatUnreadBadge({ status: 'checking', unread: 98 }).includes('98'), false);
    assert.equal(renderChatUnreadBadge({ status: 'unknown', unread: 98 }).includes('98'), false);
});

test('bad or malicious server values never enter HTML', () => {
    for (const unread of [-1, 1.5, '9', '<img src=x onerror=alert(1)>',
        NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null]) {
        assert.equal(renderChatUnreadBadge({ status: 'ready', unread }), '');
    }
    assert.equal(renderChatUnreadBadge({ status: '<svg onload=alert(1)>', unread: 1 }), '');
    assert.equal(renderChatUnreadBadge(null), '');
});

test('display contract returns immutable states and never trusts own properties on prototype', () => {
    const display = getChatUnreadDisplay({ status: 'ready', unread: 5 });
    assert.equal(display.kind, 'count');
    assert.ok(Object.isFrozen(display));
    assert.equal(getChatUnreadDisplay({ status: '__proto__', unread: 5 }), null);
});
