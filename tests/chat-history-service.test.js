import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPrivateChatHistory } from '../server/chat-history-service.js';

const chat = { version: 2, state: 'active', participants: ['alice', 'bob'] };
const msg = sequence => ({
    id: sequence.toString(16).padStart(64, '0'),
    sequence, senderId: 'alice', text: 'Привет', read: false
});
function fixture(override = {}) {
    const calls = [];
    const adapter = {
        async getChat(id) { calls.push(['chat', id]); return chat; },
        async getBlock(owner, peer) {
            calls.push(['block', owner, peer]); return { exists: false };
        },
        async listMessages(id, options) {
            calls.push(['messages', id, options]); return [msg(5), msg(4), msg(3)];
        },
        ...override
    };
    return { calls, adapter };
}
test('history service requests only bounded, ordered pages after authorization', async () => {
    const { calls, adapter } = fixture();
    const page = await loadPrivateChatHistory('alice',
        { chatId: 'chat-a', limit: 2 }, adapter);
    assert.equal(page.ok, true);
    assert.deepEqual(page.messages.map(m => m.sequence), [5, 4]);
    assert.equal(page.hasMore, true);
    assert.equal(page.nextBeforeSequence, 4);
    assert.deepEqual(calls.at(-1), ['messages', 'chat-a',
        { beforeSequence: null, limit: 3 }]);
    assert.equal(calls.filter(call => call[0] === 'block').length, 2);
});
test('history service never reads messages for invalid or unauthenticated requests', async () => {
    const { calls, adapter } = fixture();
    assert.deepEqual(await loadPrivateChatHistory(null,
        { chatId: 'chat-a', limit: 2 }, adapter),
        { ok: false, code: 'unauthenticated' });
    assert.deepEqual(await loadPrivateChatHistory('alice',
        { chatId: '../bad', limit: 2 }, adapter),
        { ok: false, code: 'invalid-argument' });
    assert.deepEqual(calls, []);
});
test('history service denies non-members before block or message reads', async () => {
    const { calls, adapter } = fixture();
    assert.deepEqual(await loadPrivateChatHistory('mallory',
        { chatId: 'chat-a', limit: 2 }, adapter),
        { ok: false, code: 'permission-denied' });
    assert.deepEqual(calls, [['chat', 'chat-a']]);
});
test('history service denies disabled chat and either direction of blocking', async () => {
    const frozen = fixture({ async getChat() { return { ...chat, state: 'frozen' }; } });
    assert.deepEqual(await loadPrivateChatHistory('alice',
        { chatId: 'chat-a', limit: 2 }, frozen.adapter),
        { ok: false, code: 'failed-precondition' });
    assert.equal(frozen.calls.length, 0);
    for (const blocker of ['alice', 'bob']) {
        const { calls, adapter } = fixture({
            async getBlock(owner) {
                calls.push(['block', owner]);
                return { exists: owner === blocker };
            }
        });
        assert.deepEqual(await loadPrivateChatHistory('alice',
            { chatId: 'chat-a', limit: 2 }, adapter),
            { ok: false, code: 'permission-denied' });
        assert.equal(calls.some(c => c[0] === 'messages'), false);
    }
});
test('history service rejects corrupted message order and oversized fetch results', async () => {
    const { adapter } = fixture({
        async listMessages() { return [msg(4), msg(5)]; }
    });
    await assert.rejects(loadPrivateChatHistory('alice',
        { chatId: 'chat-a', limit: 2 }, adapter), TypeError);
    const tooMany = fixture({ async listMessages() {
        return [msg(5), msg(4), msg(3), msg(2)];
    } });
    await assert.rejects(loadPrivateChatHistory('alice',
        { chatId: 'chat-a', limit: 2 }, tooMany.adapter), TypeError);
});
