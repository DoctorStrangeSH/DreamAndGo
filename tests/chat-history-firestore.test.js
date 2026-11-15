import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirestoreHistoryAdapter } from '../server/chat-history-firestore.js';

test('Firestore history adapter reads chat and directional blocks by exact document', async () => {
    const calls = [];
    const doc = (path) => ({
        collection(name) { return collection(path + '/' + name); },
        async get() {
            calls.push(['get', path]);
            return { exists: true, data: () => ({ version: 2 }) };
        }
    });
    const collection = path => ({ doc: id => doc(path + '/' + id) });
    const adapter = createFirestoreHistoryAdapter({ collection });
    assert.deepEqual(await adapter.getChat('chat-1'), { version: 2 });
    assert.deepEqual(await adapter.getBlock('alice', 'bob'), { exists: true });
    assert.deepEqual(calls, [
        ['get', 'chats/chat-1'],
        ['get', 'users/alice/blockedUsers/bob']
    ]);
});
test('Firestore history queries use descending sequence and bounded limit+1', async () => {
    const calls = [];
    function query() {
        return {
            where(...args) { calls.push(['where', ...args]); return this; },
            orderBy(...args) { calls.push(['orderBy', ...args]); return this; },
            limit(value) { calls.push(['limit', value]); return this; },
            async get() {
                calls.push(['get']);
                return { docs: [{ id: 'a'.repeat(64), data: () => ({
                    senderId: 'alice', sequence: 3, text: 'Привет', read: false
                }) }] };
            }
        };
    }
    const db = { collection: () => ({
        doc: () => ({ collection: () => query() })
    }) };
    const adapter = createFirestoreHistoryAdapter(db);
    const rows = await adapter.listMessages('chat-1', { beforeSequence: 4, limit: 31 });
    assert.equal(rows[0].id, 'a'.repeat(64));
    assert.deepEqual(calls, [
        ['where', 'sequence', '<', 4],
        ['orderBy', 'sequence', 'desc'],
        ['limit', 31], ['get']
    ]);
    calls.length = 0;
    await adapter.listMessages('chat-1', { beforeSequence: null, limit: 2 });
    assert.deepEqual(calls, [
        ['orderBy', 'sequence', 'desc'], ['limit', 2], ['get']
    ]);
});
