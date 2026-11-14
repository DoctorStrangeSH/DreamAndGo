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
