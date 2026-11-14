import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatOutbox } from '../js/core/chat-outbox.js';

const id = '550e8400-e29b-41d4-a716-446655440000';

test('a failed send preserves the exact immutable intent for retry', async () => {
    const attempts = [];
    const outbox = new ChatOutbox(async payload => {
        attempts.push(payload);
        if (attempts.length === 1) throw Object.assign(new Error('offline'), { code: 'unavailable' });
        return { messageId: 'server-id' };
    }, () => id);
    const intent = outbox.prepare('chat-1', '  Привет  ');
    assert.deepEqual(intent, { chatId: 'chat-1', text: 'Привет', clientMessageId: id });
    const first = await outbox.deliver(id);
    assert.equal(first.success, false);
    assert.equal(first.retryable, true);
    assert.equal(outbox.get(id), intent);
    assert.deepEqual(await outbox.deliver(id), { success: true, messageId: 'server-id' });
    assert.equal(outbox.get(id), null);
    assert.strictEqual(attempts[0], attempts[1]);
});

test('multiple clicks reuse a single active network request', async () => {
    let calls = 0;
    let finish;
    const outbox = new ChatOutbox(() => {
        calls += 1;
        return new Promise(resolve => { finish = resolve; });
    }, () => id);
    outbox.prepare('chat-1', 'hello');
    const first = outbox.deliver(id);
    const second = outbox.deliver(id);
    assert.strictEqual(first, second);
    await Promise.resolve();
    assert.equal(calls, 1);
    assert.equal(outbox.discard(id), false);
    finish({ messageId: '1' });
    assert.deepEqual(await first, { success: true, messageId: '1' });
});

test('session reset prevents late response from affecting a new session', async () => {
    let finish;
    const outbox = new ChatOutbox(() => new Promise(resolve => { finish = resolve; }), () => id);
    outbox.prepare('chat-1', 'old');
    const pending = outbox.deliver(id);
    await Promise.resolve();
    outbox.clear();
    assert.equal(outbox.get(id), null);
    finish({ messageId: 'late-success' });
    assert.equal((await pending).success, false);
    assert.equal(outbox.get(id), null);
});

test('validation prevents blank/oversized messages, unsafe paths and repeated ids', () => {
    const outbox = new ChatOutbox(async () => ({ messageId: 'x' }), () => id);
    assert.throws(() => outbox.prepare('chat', '  '));
    assert.throws(() => outbox.prepare('chat', 'x'.repeat(2001)));
    assert.throws(() => outbox.prepare('a/b', 'hello'));
    assert.throws(() => outbox.prepare('', 'hello'));
    outbox.prepare('chat', 'hello');
    assert.throws(() => outbox.prepare('chat', 'second'));
    assert.equal(outbox.discard(id), true);
    assert.equal(outbox.get(id), null);
});

test('missing server confirmation retains the message for manual retry', async () => {
    const outbox = new ChatOutbox(async () => ({}), () => id);
    outbox.prepare('chat-1', 'hello');
    const result = await outbox.deliver(id);
    assert.equal(result.success, false);
    assert.ok(outbox.get(id));
});

test('explicitly restored intent reuses UUID after simulated restart', async () => {
    let reachedServer = false;
    const sent = [];
    const transport = async intent => {
        sent.push(intent);
        if (!reachedServer) {
            reachedServer = true;
            // Simulates server commit followed by lost network acknowledgement.
            throw Object.assign(new Error('connection lost'), { code: 'unavailable' });
        }
        return { messageId: 'same-server-record' };
    };
    const oldClient = new ChatOutbox(transport, () => id);
    oldClient.prepare('chat-1', 'Привет');
    assert.equal((await oldClient.deliver(id)).success, false);
    // New instance receives intent explicitly; the outbox never wrote localStorage.
    const restartedClient = new ChatOutbox(transport);
    const recovered = restartedClient.restore('chat-1', 'Привет', id);
    assert.equal(recovered.clientMessageId, id);
    assert.deepEqual(await restartedClient.deliver(id),
        { success: true, messageId: 'same-server-record' });
    assert.deepEqual(sent[0], sent[1]);
    assert.equal(restartedClient.get(id), null);
});

test('restoration refuses changed text, reused UUID for a different chat and invalid IDs', () => {
    const outbox = new ChatOutbox(async () => ({ messageId: 'server' }));
    const restored = outbox.restore('chat-1', 'Hello', id);
    assert.strictEqual(outbox.restore('chat-1', 'Hello', id), restored);
    assert.throws(() => outbox.restore('chat-2', 'Hello', id));
    assert.throws(() => outbox.restore('chat-1', 'Changed', id));
    assert.throws(() => outbox.restore('chat-1', ' Hello ', '650e8400-e29b-41d4-a716-446655440000'));
    assert.throws(() => outbox.restore('chat-1', 'Hello', 'not-a-uuid'));
});

test('reconciliation acknowledges committed message without sending again', async () => {
    let sends = 0;
    const outbox = new ChatOutbox(async () => { sends++; return { messageId: 'm' }; }, () => id);
    outbox.prepare('chat-1', 'Hello');
    assert.deepEqual(await outbox.reconcile(id, async payload => {
        assert.equal(payload.clientMessageId, id);
        return { status: 'sent', messageId: 'existing-message' };
    }), { status: 'sent', messageId: 'existing-message' });
    assert.equal(outbox.get(id), null);
    assert.equal(sends, 0);
});

test('missing or failed status checks preserve original intent for deliberate retry', async () => {
    const outbox = new ChatOutbox(async () => ({ messageId: 'created' }), () => id);
    const intent = outbox.prepare('chat-1', 'Hello');
    assert.deepEqual(await outbox.reconcile(id, async () => ({ status: 'missing' })), { status: 'missing' });
    assert.deepEqual(await outbox.reconcile(id, async () => { throw new Error('offline'); }), { status: 'unknown' });
    assert.strictEqual(outbox.get(id), intent);
    assert.deepEqual(await outbox.deliver(id), { success: true, messageId: 'created' });
});

test('status checks are deduplicated and cannot race with retry or discard', async () => {
    let resolve;
    let calls = 0;
    const outbox = new ChatOutbox(async () => ({ messageId: 'created' }), () => id);
    outbox.prepare('chat-1', 'Hello');
    const lookup = () => { calls++; return new Promise(done => { resolve = done; }); };
    const first = outbox.reconcile(id, lookup);
    assert.strictEqual(outbox.reconcile(id, lookup), first);
    await Promise.resolve();
    assert.equal(calls, 1);
    assert.equal(outbox.discard(id), false);
    assert.equal((await outbox.deliver(id)).success, false);
    resolve({ status: 'missing' });
    assert.deepEqual(await first, { status: 'missing' });
    assert.ok(outbox.get(id));
});

test('logout invalidates an in-progress server status response', async () => {
    let resolve;
    const outbox = new ChatOutbox(async () => ({ messageId: 'new' }), () => id);
    outbox.prepare('chat-1', 'Old');
    const checking = outbox.reconcile(id, () => new Promise(done => { resolve = done; }));
    await Promise.resolve();
    outbox.clear();
    outbox.restore('chat-1', 'New', id);
    resolve({ status: 'sent', messageId: 'old' });
    assert.deepEqual(await checking, { status: 'stale' });
    assert.equal(outbox.get(id)?.text, 'New');
});
