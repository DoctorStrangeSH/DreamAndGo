import test from 'node:test';
import assert from 'node:assert/strict';
import { getMessageDeliveryDisplay, renderMessageDeliveryIndicator } from '../js/core/chat-delivery-status.js';

const me = 'alice';
test('rendering leaves legacy messages without invented delivery confirmation', () => {
    assert.equal(getMessageDeliveryDisplay({ senderId: me, read: false }, me), null);
    assert.equal(renderMessageDeliveryIndicator({ senderId: me, read: true }, me), '');
    assert.equal(renderMessageDeliveryIndicator({ senderId: 'bob', deliveryStatus: 'read' }, me), '');
});

test('candidate v2 delivery states have accessible Russian text and distinct icons', () => {
    for (const [state, label, icon] of [
        ['sending', 'Отправляется', 'bi-clock'],
        ['checking', 'Проверяем доставку', 'bi-arrow-repeat'],
        ['sent', 'Отправлено', 'bi-check'],
        ['read', 'Прочитано', 'bi-check-all'],
        ['failed', 'Не удалось отправить', 'bi-exclamation-circle']
    ]) {
        const result = renderMessageDeliveryIndicator({ senderId: me, deliveryStatus: state }, me);
        assert.ok(result.includes(`aria-label="${label}"`));
        assert.ok(result.includes(icon));
        assert.ok(result.includes('visually-hidden'));
    }
});

test('unknown or malicious delivery states never become HTML', () => {
    const attack = '<img src=x onerror=alert(1)>';
    assert.equal(renderMessageDeliveryIndicator({ senderId: me, deliveryStatus: attack }, me), '');
    assert.equal(renderMessageDeliveryIndicator({ senderId: me, deliveryStatus: '__proto__' }, me), '');
    assert.equal(renderMessageDeliveryIndicator({ senderId: me, deliveryStatus: null }, me), '');
});
