import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatDeliveryController } from '../js/core/chat-delivery-controller.js';
import { renderMessageDeliveryIndicator } from '../js/core/chat-delivery-status.js';

const id = '550e8400-e29b-41d4-a716-446655440000';
const make = (send, lookup, onChange = () => {}) =>
    new ChatDeliveryController(send, lookup, 'alice', () => id, onChange);

test('successful transport updates sending to sent; read requires matching receipt', async () => {
    const changes = [];
    const controller = make(async () => ({ messageId: 'server-1' }),
        async () => ({ status: 'missing' }), m => changes.push(m?.deliveryStatus));
    controller.prepare('chat-1', 'Hello');
    assert.ok(renderMessageDeliveryIndicator(controller.get(id), 'alice').includes('Отправляется'));
    assert.deepEqual(await controller.send(id), { success: true, messageId: 'server-1' });
    assert.equal(controller.get(id).deliveryStatus, 'sent');
    assert.equal(controller.acknowledgeRead(id, 'wrong'), false);
    assert.equal(controller.acknowledgeRead(id, 'server-1'), true);
    assert.equal(controller.get(id).deliveryStatus, 'read');
    assert.deepEqual(changes, ['sending', 'sending', 'sent', 'read']);
});

test('ambiguous network failure checks status and never creates another message', async () => {
    let sends = 0;
    const controller = make(async () => {
        sends++;
        throw Object.assign(new Error('lost acknowledgement'), { code: 'unavailable' });
    }, async () => ({ status: 'sent', messageId: 'committed' }));
    controller.prepare('chat-1', 'Hello');
    assert.equal((await controller.send(id)).success, false);
    assert.equal(controller.get(id).deliveryStatus, 'checking');
    assert.deepEqual(await controller.reconcile(id), { status: 'sent', messageId: 'committed' });
    assert.equal(controller.get(id).deliveryStatus, 'sent');
    assert.equal(sends, 1);
});

test('missing status offers manual retry of original ID while unknown stays checking', async () => {
    let lookupMode = 'unknown';
    let sendCount = 0;
    const controller = make(async () => { sendCount++; return { messageId: 'created' }; },
        async () => lookupMode === 'unknown' ? { nonsense: true } : { status: 'missing' });
    controller.restore('chat-1', 'Hello', id);
    assert.deepEqual(await controller.reconcile(id), { status: 'unknown' });
    assert.equal(controller.get(id).deliveryStatus, 'checking');
    lookupMode = 'missing';
    assert.deepEqual(await controller.reconcile(id), { status: 'missing' });
    assert.equal(controller.get(id).deliveryStatus, 'failed');
    assert.equal(sendCount, 0);
    assert.deepEqual(await controller.send(id), { success: true, messageId: 'created' });
    assert.equal(sendCount, 1);
});

test('clearing account prevents late send from populating a fresh account view', async () => {
    let finish;
    const controller = make(() => new Promise(resolve => { finish = resolve; }),
        async () => ({ status: 'missing' }));
    controller.prepare('chat-1', 'Old');
    const sending = controller.send(id);
    await Promise.resolve();
    controller.clear();
    controller.restore('chat-2', 'New', id);
    finish({ messageId: 'old-confirmation' });
    assert.equal((await sending).success, false);
    assert.equal(controller.get(id).text, 'New');
    assert.equal(controller.get(id).deliveryStatus, 'checking');
});

test('failed precondition remains failed; unacknowledged messages are not read', async () => {
    const controller = make(async () => ({}), async () => ({ status: 'missing' }));
    controller.prepare('chat-1', 'Hello');
    assert.equal((await controller.send(id)).success, false);
    assert.equal(controller.get(id).deliveryStatus, 'failed');
    assert.equal(controller.acknowledgeRead(id, 'pretend'), false);
});

test('sender-side status lookup promotes sent to read only on matching server evidence', async () => {
    let reply = { status: 'sent', messageId: 'server-1', read: false };
    const controller = make(async () => ({ messageId: 'server-1' }), async input => {
        assert.deepEqual(input, { chatId: 'chat-1', clientMessageId: id });
        return reply;
    });
    controller.prepare('chat-1', 'Private message');
    await controller.send(id);
    assert.deepEqual(await controller.refreshRead(id), { status: 'unconfirmed' });
    assert.equal(controller.get(id).deliveryStatus, 'sent');
    reply = { status: 'sent', messageId: 'another-message', read: true };
    assert.deepEqual(await controller.refreshRead(id), { status: 'unconfirmed' });
    assert.equal(controller.get(id).deliveryStatus, 'sent');
    reply = { status: 'sent', messageId: 'server-1', read: true };
    assert.deepEqual(await controller.refreshRead(id), { status: 'read' });
    assert.equal(controller.get(id).deliveryStatus, 'read');
    assert.deepEqual(await controller.refreshRead(id), { status: 'read' });
});

test('receipt lookup errors keep sent state; concurrent checks are deduplicated', async () => {
    let finish, calls = 0;
    const controller = make(async () => ({ messageId: 'server-1' }), () => {
        calls++;
        return new Promise(resolve => { finish = resolve; });
    });
    controller.prepare('chat-1', 'Private');
    await controller.send(id);
    const a = controller.refreshRead(id);
    const b = controller.refreshRead(id);
    assert.strictEqual(a, b);
    await Promise.resolve();
    assert.equal(calls, 1);
    finish({ status: 'sent', messageId: 'server-1', read: false });
    assert.deepEqual(await a, { status: 'unconfirmed' });
    assert.equal(controller.get(id).deliveryStatus, 'sent');
});

test('late read receipt cannot contaminate new account view after clear', async () => {
    let finish;
    const controller = make(async () => ({ messageId: 'server-1' }),
        () => new Promise(resolve => { finish = resolve; }));
    controller.prepare('chat-1', 'Old');
    await controller.send(id);
    const receipt = controller.refreshRead(id);
    await Promise.resolve();
    controller.clear();
    controller.restore('chat-2', 'New', id);
    finish({ status: 'sent', messageId: 'server-1', read: true });
    assert.deepEqual(await receipt, { status: 'stale' });
    assert.equal(controller.get(id).deliveryStatus, 'checking');
});


test('controller consistently normalizes restored UUIDs across status, retry, receipts and discard', async () => {
    const upper = id.toUpperCase();
    let sends = 0;
    let read = false;
    const controller = make(async payload => {
        sends++;
        assert.equal(payload.clientMessageId, id);
        return { messageId: 'server-normalized' };
    }, async payload => {
        assert.equal(payload.clientMessageId, id);
        return { status: 'sent', messageId: 'server-normalized', read };
    });
    controller.restore('chat-1', 'Hello', upper);
    assert.equal(controller.get(upper).deliveryStatus, 'checking');
    assert.deepEqual(await controller.reconcile(upper), { status: 'sent', messageId: 'server-normalized' });
    assert.equal(controller.get(upper).deliveryStatus, 'sent');
    assert.equal(sends, 0);
    read = true;
    assert.deepEqual(await controller.refreshRead(upper), { status: 'read' });
    assert.equal(controller.get(upper).deliveryStatus, 'read');
    assert.equal(controller.acknowledgeRead(upper, 'wrong'), false);

    const pendingId = '650e8400-e29b-41d4-a716-446655440000';
    // Use a distinct controller UUID factory for the second intent.
    const second = new ChatDeliveryController(async () => ({ messageId: 'unused' }),
        async () => ({ status: 'missing' }), 'alice', () => pendingId);
    second.prepare('chat-1', 'Discard me');
    assert.equal(second.discard(pendingId.toUpperCase()), true);
    assert.equal(second.get(pendingId), null);
    assert.deepEqual(await second.send('not-a-uuid'), {
        success: false, error: 'Некорректный идентификатор отправки'
    });
    assert.equal(controller.get('not-a-uuid'), null);
});
