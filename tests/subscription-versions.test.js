import test from 'node:test';
import assert from 'node:assert/strict';
import { SubscriptionVersions } from '../js/core/subscription-versions.js';

test('stale realtime callback is rejected after unsubscription', () => {
    const versions = new SubscriptionVersions();
    const oldToken = versions.invalidate('messages_alice');
    assert.equal(versions.isCurrent('messages_alice', oldToken), true);
    versions.invalidate('messages_alice');
    assert.equal(versions.isCurrent('messages_alice', oldToken), false);
});

test('old cleanup cannot be confused with newer generation', () => {
    const versions = new SubscriptionVersions();
    const first = versions.invalidate('friends_alice');
    const second = versions.invalidate('friends_alice');
    assert.equal(versions.isCurrent('friends_alice', first), false);
    assert.equal(versions.isCurrent('friends_alice', second), true);
    assert.equal(versions.current('friends_alice'), second);
});

test('independent subscription keys remain active', () => {
    const versions = new SubscriptionVersions();
    const messageToken = versions.invalidate('messages_one');
    const chatToken = versions.invalidate('chats_one');
    versions.invalidate('messages_one');
    assert.equal(versions.isCurrent('messages_one', messageToken), false);
    assert.equal(versions.isCurrent('chats_one', chatToken), true);
});
