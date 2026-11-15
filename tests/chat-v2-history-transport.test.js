import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatV2Transport } from '../js/core/chat-v2-transport.js';
import { ChatV2PilotConversation } from '../js/core/chat-v2-pilot-conversation.js';

const message = n => ({
    id: n.toString(16).padStart(64, '0'), sequence: n,
    senderId: n % 2 ? 'alice' : 'bob', text: 'Текст ' + n, read: false
});

test('history callable validates bounded requests and normalized ordered pages', async () => {
    const calls = [];
    const api = new ChatV2Transport(async (name, payload) => {
        calls.push({ name, payload });
        return { data: {
            chatId: 'chat-a', messages: [message(5), message(4)],
            hasMore: true, nextBeforeSequence: 4
        } };
    }, () => 'alice');
    const page = await api.history({ chatId: 'chat-a', limit: 2 });
    assert.deepEqual(calls, [{
        name: 'getPrivateChatHistoryV2',
        payload: { chatId: 'chat-a', beforeSequence: null, limit: 2 }
    }]);
    assert.deepEqual(page.messages.map(x => x.sequence), [5, 4]);
    assert.equal(Object.isFrozen(page.messages[0]), true);
    await assert.rejects(api.history({ chatId: '../', limit: 2 }), TypeError);
    await assert.rejects(api.history({ chatId: 'chat-a', limit: 51 }), TypeError);
    await assert.rejects(api.history({ chatId: 'chat-a', beforeSequence: 0 }), TypeError);
    assert.equal(calls.length, 1);
});

test('history rejects malformed cross-chat, forged or out-of-order server replies', async () => {
    let data;
    const api = new ChatV2Transport(async () => ({ data }), () => 'alice');
    const request = { chatId: 'chat-a', limit: 2 };
    data = { chatId: 'wrong', messages: [], hasMore: false, nextBeforeSequence: null };
    await assert.rejects(api.history(request), /история/);
    data = { chatId: 'chat-a', messages: [message(4), message(5)],
        hasMore: true, nextBeforeSequence: 5 };
    await assert.rejects(api.history(request), /история/);
    data = { chatId: 'chat-a', messages: [message(5), { ...message(4), read: 'false' }],
        hasMore: true, nextBeforeSequence: 4 };
    await assert.rejects(api.history(request), /история/);
    data = { chatId: 'chat-a', messages: [message(5)],
        hasMore: true, nextBeforeSequence: 2 };
    await assert.rejects(api.history(request), /курсор/);
    data = { chatId: 'chat-a', messages: [],
        hasMore: true, nextBeforeSequence: null };
    await assert.rejects(api.history(request), /курсор/);
});

test('history rejects late results after account switch and explicit invalidation', async () => {
    let userId = 'alice', finish;
    const api = new ChatV2Transport(() => new Promise(resolve => { finish = resolve; }),
        () => userId);
    const pending = api.history({ chatId: 'chat-a' });
    userId = 'bob';
    finish({ data: { chatId: 'chat-a', messages: [], hasMore: false, nextBeforeSequence: null } });
    await assert.rejects(pending, /Сессия изменилась/);
    userId = 'alice';
    const second = api.history({ chatId: 'chat-a' });
    api.invalidate();
    finish({ data: { chatId: 'chat-a', messages: [], hasMore: false, nextBeforeSequence: null } });
    await assert.rejects(second, /Сессия изменилась/);
});

test('pilot conversation uses session history method when no fake lookup is injected', async () => {
    const calls = [], snapshots = [];
    const session = {
        userId: 'alice',
        prepare() {}, send() {},
        loadHistory: async request => {
            calls.push(request);
            return { chatId: request.chatId, messages: [message(1)],
                hasMore: false, nextBeforeSequence: null };
        }
    };
    const view = {
        mount() {}, destroy() {}, setHistoryState(state) { snapshots.push(state); }
    };
    const pilot = new ChatV2PilotConversation({
        root: {}, chatId: 'chat-a', session,
        viewFactory: () => view
    });
    await pilot.mount();
    assert.deepEqual(calls, [{ chatId: 'chat-a', beforeSequence: null, limit: 30 }]);
    assert.deepEqual(snapshots.at(-1).messages.map(x => x.sequence), [1]);
    pilot.dispose();
});
