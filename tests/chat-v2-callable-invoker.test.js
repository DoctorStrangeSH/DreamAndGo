import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CHAT_V2_ENDPOINTS,
    createChatV2CallableInvoker
} from '../js/core/chat-v2-callable-invoker.js';

test('only explicit Chat V2 callable endpoints are exposed', async () => {
    const functions = {};
    const created = [];
    const invoker = createChatV2CallableInvoker((instance, name) => {
        assert.equal(instance, functions);
        created.push(name);
        return async payload => ({ data: { name, payload } });
    }, functions);

    const result = await invoker('sendPrivateMessageV2', { chatId: 'chat-1', text: 'hi' });
    assert.deepEqual(result, {
        data: {
            name: 'sendPrivateMessageV2',
            payload: { chatId: 'chat-1', text: 'hi' }
        }
    });
    assert.deepEqual(created, ['sendPrivateMessageV2']);
    assert.equal(CHAT_V2_ENDPOINTS.includes('sendPrivateMessageV2'), true);
    assert.equal(CHAT_V2_ENDPOINTS.includes('getMyChatContactsV2'), true);
    assert.equal(CHAT_V2_ENDPOINTS.includes('markPrivateMessagesReadV2'), true);
});

test('callable handles are cached per endpoint', async () => {
    let created = 0;
    const invoker = createChatV2CallableInvoker(() => {
        created += 1;
        return async payload => payload;
    }, {});

    await invoker('getPrivateChatHistoryV2', { chatId: 'chat-1' });
    await invoker('getPrivateChatHistoryV2', { chatId: 'chat-2' });
    assert.equal(created, 1);
});

test('unknown endpoint and malformed payloads are rejected', () => {
    const invoker = createChatV2CallableInvoker(() => async () => ({}), {});
    assert.throws(() => invoker('deleteEverything', {}), TypeError);
    assert.throws(() => invoker('sendPrivateMessageV2', null), TypeError);
    assert.throws(() => invoker('sendPrivateMessageV2', []), TypeError);
    assert.throws(() => invoker('sendPrivateMessageV2', 'bad'), TypeError);
});

test('missing Firebase Functions SDK dependencies fail closed', () => {
    assert.throws(() => createChatV2CallableInvoker(null, {}), TypeError);
    assert.throws(() => createChatV2CallableInvoker(() => async () => ({}), null), TypeError);
});
