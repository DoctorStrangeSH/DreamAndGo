import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/services/realtime.service.js', import.meta.url), 'utf8');

test('realtime social and chat subscriptions never read raw private user documents', () => {
    assert.match(source, /getPublicProfilesByIds/);
    assert.doesNotMatch(source, /getDoc\(/);
    assert.doesNotMatch(source, /toPublicProfile\(/);

    const pairs = [
        ['subscribeToChats', 'subscribeToFriends'],
        ['subscribeToFriends', 'subscribeToFriendRequests'],
        ['subscribeToFriendRequests', 'subscribeToSentRequests'],
        ['subscribeToSentRequests', 'async getUserProfiles']
    ];
    for (const [method, nextMethod] of pairs) {
        const start = source.indexOf('    ' + method + '(');
        const end = source.indexOf('\n    ' + nextMethod + '(', start + 1);
        assert.ok(start >= 0 && end > start, method + ' method boundary must exist');
        assert.match(source.slice(start, end), /getUserProfiles\(/, method + ' must use batched public profile projection');
    }
});

test('realtime profile batches validate and deduplicate user IDs before callable lookup', () => {
    assert.match(source, /getUserProfiles\(uids\)/);
    assert.match(source, /\[\.\.\.new Set\(uids\.filter\(isValidChatUid\)\)\]/);
    assert.match(source, /getPublicProfilesByIds\(uniqueUids\)/);
    assert.match(source, /new Map\(profiles\.map\(profile => \[profile\.uid, profile\]\)\)/);
});
