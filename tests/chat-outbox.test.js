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
