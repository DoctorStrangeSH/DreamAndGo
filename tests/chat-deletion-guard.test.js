import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/chat/chat.js', import.meta.url), 'utf8');

test('both deletion modes share one per-chat in-flight lock', () => {
    const local = source.slice(source.indexOf('    async deleteChatLocal()'), source.indexOf('    async deleteChatFull()'));
    const full = source.slice(source.indexOf('    async deleteChatFull()'), source.indexOf('    showDeleteChatDialog()'));
    for (const method of [local, full]) {
        assert.match(method, /const operationKey = JSON\.stringify\(\[userId, partnerId\]\)/);
        assert.match(method, /this\.pendingChatDeletions\.has\(operationKey\)/);
        assert.match(method, /this\.pendingChatDeletions\.add\(operationKey\)/);
        assert.match(method, /finally\s*\{\s*this\.pendingChatDeletions\.delete\(operationKey\)/);
    }
});
