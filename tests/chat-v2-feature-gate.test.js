import test from 'node:test';
import assert from 'node:assert/strict';
import { canStartChatV2, createGatedChatV2Session } from '../js/core/chat-v2-feature-gate.js';
import { CHAT_V2_ENDPOINTS, createChatV2CallableInvoker } from '../js/core/chat-v2-callable-invoker.js';

const allowed = Object.freeze({
    enabled: true, backendReady: true, allowedUserIds: ['alice']
});

test('v2 rollout is disabled without explicit backend readiness and user allowlist', () => {
    assert.equal(canStartChatV2(undefined, 'alice'), false);
    assert.equal(canStartChatV2({ enabled: true }, 'alice'), false);
    assert.equal(canStartChatV2({ ...allowed, backendReady: false }, 'alice'), false);
    assert.equal(canStartChatV2({ ...allowed, enabled: 'true' }, 'alice'), false);
    assert.equal(canStartChatV2({ ...allowed, allowedUserIds: '*' }, 'alice'), false);
    assert.equal(canStartChatV2(allowed, 'bob'), false);
    assert.equal(canStartChatV2(allowed, ''), false);
    assert.equal(canStartChatV2(allowed, 'alice'), true);
});

test('disabled pilot creates no client session and cannot invoke backend', () => {
    let calls = 0;
    const session = createGatedChatV2Session({
        rollout: { ...allowed, backendReady: false },
        getUserId: () => 'alice',
        invoke: () => { calls++; throw new Error('must not run'); }
    });
    assert.equal(session, null);
    assert.equal(calls, 0);
});

test('approved pilot creates a v2 session without touching legacy UI', async () => {
    const endpoints = [];
    const session = createGatedChatV2Session({
        rollout: allowed,
        getUserId: () => 'alice',
        invoke: async name => {
            endpoints.push(name);
            return { data: { chatId: 'chat-a', version: 2 } };
        }
    });
    assert.ok(session);
    assert.deepEqual(await session.createChat('bob'), { chatId: 'chat-a', version: 2 });
    assert.deepEqual(endpoints, ['createPrivateChatV2']);
    session.dispose();
});

test('callable invoker exposes exactly five named endpoints and rejects arbitrary calls', async () => {
    const names = [], payloads = [], functions = {};
    const invoke = createChatV2CallableInvoker((instance, name) => {
        assert.equal(instance, functions);
        names.push(name);
        return async data => { payloads.push(data); return { data: { ok: true } }; };
    }, functions);
    for (const name of CHAT_V2_ENDPOINTS) {
        const body = { sample: name };
        assert.deepEqual(await invoke(name, body), { data: { ok: true } });
        assert.deepEqual(await invoke(name, body), { data: { ok: true } });
    }
    assert.deepEqual(names, CHAT_V2_ENDPOINTS);
    assert.equal(payloads.length, CHAT_V2_ENDPOINTS.length * 2);
    assert.throws(() => invoke('deleteUser', {}), /Недопустимая/);
    assert.throws(() => invoke('sendPrivateMessageV2', 'hello'), /Некорректный/);
    assert.throws(() => invoke('__proto__', {}), /Недопустимая/);
});

test('invalid SDK adapter dependencies are rejected early', () => {
    assert.throws(() => createChatV2CallableInvoker(null, {}), TypeError);
    assert.throws(() => createChatV2CallableInvoker(() => () => ({}), null), TypeError);
    const call = createChatV2CallableInvoker(() => null, {});
    assert.throws(() => call('getPrivateChatUnreadV2', {}), /Недоступная/);
});
