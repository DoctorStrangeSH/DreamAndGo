import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatV2Transport } from '../js/core/chat-v2-transport.js';

const uuid = '550e8400-e29b-41d4-a716-446655440000';
const messageId = 'a'.repeat(64);

test('routes only validated calls to the named candidate v2 endpoints', async () => {
    const calls = [];
    const replies = {
        createPrivateChatV2: { chatId: 'chat-a', version: 2 },
        sendPrivateMessageV2: { chatId: 'chat-a', messageId },
        getPrivateMessageStatusV2: { status: 'sent', messageId, read: true },
        markPrivateMessageReadV2: { status: 'read', messageId },
        getPrivateChatUnreadV2: { chatId: 'chat-a', unread: 5 }
    };
    const api = new ChatV2Transport(async (name, data) => {
        calls.push({ name, data });
        return { data: replies[name] };
    }, () => 'alice');
    assert.deepEqual(await api.createChat('bob'), { chatId: 'chat-a', version: 2 });
    assert.deepEqual(await api.send({ chatId: 'chat-a', text: 'Hi', clientMessageId: uuid }), {
        chatId: 'chat-a', messageId
    });
    assert.deepEqual(await api.status({ chatId: 'chat-a', clientMessageId: uuid }), {
        status: 'sent', messageId, read: true
    });
    assert.deepEqual(await api.markRead('chat-a', messageId), { status: 'read', messageId });
    assert.deepEqual(await api.unread({ chatId: 'chat-a' }), { chatId: 'chat-a', unread: 5 });
    assert.deepEqual(calls.map(x => x.name), Object.keys(replies));
    assert.deepEqual(calls[1].data, { chatId: 'chat-a', text: 'Hi', clientMessageId: uuid });
    assert.equal('senderId' in calls[1].data, false);
});

test('unauthenticated sessions and invalid arguments never reach the server', async () => {
    let calls = 0;
    const api = new ChatV2Transport(async () => { calls++; return { data: {} }; }, () => null);
    await assert.rejects(api.unread({ chatId: 'chat-a' }), /вход/);
    await assert.rejects(api.createChat('bob'), /вход/);
    await assert.rejects(api.send({ chatId: 'bad/id', text: 'Hi', clientMessageId: uuid }), TypeError);
    await assert.rejects(api.markRead('chat-a', '<script>'), TypeError);
    assert.equal(calls, 0);
});

test('stale session results are rejected after sign-out or account switching', async () => {
    let finish, userId = 'alice';
    const api = new ChatV2Transport(() => new Promise(resolve => { finish = resolve; }), () => userId);
    const pending = api.unread({ chatId: 'chat-a' });
    await Promise.resolve();
    userId = 'bob';
    finish({ data: { chatId: 'chat-a', unread: 10 } });
    await assert.rejects(pending, /Сессия изменилась/);
    userId = 'alice';
    const second = api.unread({ chatId: 'chat-a' });
    await Promise.resolve();
    api.invalidate();
    finish({ data: { chatId: 'chat-a', unread: 10 } });
    await assert.rejects(second, /Сессия изменилась/);
});

test('malformed or forged success envelopes never confirm delivery or read', async () => {
    let reply = { data: { chatId: 'wrong', messageId } };
    const api = new ChatV2Transport(async () => reply, () => 'alice');
    await assert.rejects(api.send({ chatId: 'chat-a', text: 'Hi', clientMessageId: uuid }), /подтверждение/);
    reply = { data: { status: 'sent', messageId, read: 'true' } };
    await assert.rejects(api.status({ chatId: 'chat-a', clientMessageId: uuid }), /статус/);
    reply = { data: { status: 'read', messageId: 'b'.repeat(64) } };
    await assert.rejects(api.markRead('chat-a', messageId), /квитанция/);
    reply = { data: { chatId: 'chat-a', unread: '99' } };
    await assert.rejects(api.unread({ chatId: 'chat-a' }), /счётчик/);
    reply = { nonsense: true };
    await assert.rejects(api.unread({ chatId: 'chat-a' }), /ответ сервера/);
});


test('transport rejects malformed authenticated and partner UIDs before invoking backend', async () => {
    let calls = 0;
    let userId = 'alice';
    const api = new ChatV2Transport(async () => {
        calls++;
        return { data: { chatId: 'chat-a', version: 2 } };
    }, () => userId);

    for (const invalid of ['', ' alice', 'alice ', 'alice/other', 'x'.repeat(129)]) {
        userId = invalid;
        await assert.rejects(api.unread({ chatId: 'chat-a' }), /вход в аккаунт/);
    }
    userId = 'alice';
    for (const invalid of ['', ' bob', 'bob ', 'bob/other', 'x'.repeat(129)]) {
        await assert.rejects(api.createChat(invalid), TypeError);
    }
    assert.equal(calls, 0);
});
