import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/services/realtime.service.js', import.meta.url), 'utf8');

test('realtime social and chat subscriptions never read raw private user documents', () => {
    assert.match(source, /getPublicProfilesByIds/);
    assert.doesNotMatch(source, /getDoc\(/);
    assert.doesNotMatch(source, /toPublicProfile\(/);
    for (const method of ['subscribeToChats', 'subscribeToFriends', 'subscribeToFriendRequests', 'subscribeToSentRequests']) {
        const start = source.indexOf('    ' + method + '(');
        const next = source.indexOf('\n    ', start + 5);
        const body = source.slice(start, next < 0 ? source.length : next);
        assert.match(body, /getUserProfiles\(/, method + ' must use the batched public profile projection');
    }
});

test('realtime profile batches validate and deduplicate user IDs before callable lookup', () => {
    assert.match(source, /getUserProfiles\(uids\)/);
    assert.match(source, /\[\.\.\.new Set\(uids\.filter\(isValidChatUid\)\)\]/);
    assert.match(source, /getPublicProfilesByIds\(uniqueUids\)/);
    assert.match(source, /new Map\(profiles\.map\(profile => \[profile\.uid, profile\]\)\)/);
});
