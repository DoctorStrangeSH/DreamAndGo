import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/services/notifications.service.js', import.meta.url), 'utf8');

test('notification service has no client-side notification creation API', () => {
    assert.doesNotMatch(source, /\baddDoc\s*\(/);
    assert.doesNotMatch(source, /\baddNotification\s*\(/);
    for (const method of [
        'notifyFriendRequest',
        'notifyFriendAccepted',
        'notifyNewMessage',
        'notifyAchievement',
        'notifyLevelUp'
    ]) {
        assert.doesNotMatch(source, new RegExp('\\b' + method + '\\s*\\('));
    }
});

test('notification reads and mutations are bound to the active Firebase Auth owner', () => {
    assert.match(source, /import \{ auth, db \} from '\.\.\/config\/firebase\.js'/);
    assert.match(source, /isCurrentOwner\(userId\)/);
    assert.match(source, /this\.auth\?\.currentUser\?\.uid === userId/);
    assert.match(source, /if \(!this\.isCurrentOwner\(userId\)\) return false/);
});

test('notification document IDs are validated before Firestore path construction', () => {
    assert.match(source, /isValidDocumentId\(notificationId\)/);
    assert.match(source, /\^\[A-Za-z0-9_-\]\{1,128\}\$/);
});

test('queued notification snapshots are ignored after an account switch', () => {
    assert.match(source, /if \(!this\.isCurrentOwner\(userId\)\) return/);
});
