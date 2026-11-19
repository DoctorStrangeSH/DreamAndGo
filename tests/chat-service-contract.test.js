import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/services/chat.service.js', import.meta.url), 'utf8');

test('chat deletion imports the Firestore query limiter it uses', () => {
    assert.match(source, /query\(messagesRef,\s*limit\(499\)\)/);
    const imports = source.match(/import\s*\{([^}]+)\}\s*from\s*['"]https:\/\/www\.gstatic\.com\/firebasejs\/[^'"]+firebase-firestore\.js['"]/s);
    assert.ok(imports, 'Firestore named import must be present');
    const namedImports = imports[1].split(',').map(name => name.trim());
    assert.ok(namedImports.includes('limit'), 'Firestore limit must be imported');
});


test('chat service validates UIDs before building Firestore paths', () => {
    assert.match(source, /getChatId\(userId1, userId2\)\s*\{\s*if \(!isValidChatUid\(userId1\) \|\| !isValidChatUid\(userId2\) \|\| userId1 === userId2\)/);
    for (const method of ['getChats', 'getOrCreateChat', 'markAsRead', 'deleteChat', 'deleteChatLocal', 'getUserProfile']) {
        const start = source.indexOf('    async ' + method + '(');
        const next = source.indexOf('\n    async ', start + 1);
        const body = source.slice(start, next < 0 ? source.length : next);
        assert.match(body, /isValidChatUid\(/, method + ' validates user identifiers');
    }
});

test('message mutations validate actor, conversation and message path segments', () => {
    for (const method of ['deleteMessage', 'editMessage']) {
        const start = source.indexOf('    async ' + method + '(');
        const next = source.indexOf('\n    async ', start + 1);
        const body = source.slice(start, next < 0 ? source.length : next);
        assert.match(body, /isValidChatUid\(actorId\)/);
        assert.match(body, /isValidChatPathSegment\(chatId, 257\)/);
        assert.match(body, /isValidChatUid\(messageId\)/);
    }
});
