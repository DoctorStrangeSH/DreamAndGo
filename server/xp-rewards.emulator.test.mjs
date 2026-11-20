import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
    awardXpForVerifiedEvent, XP_DAILY_LIMIT, XP_DAILY_ACTION_LIMIT
} from './xp-rewards.js';
import { isDreamCompletionTransition } from '../js/core/xp-reward-policy.js';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Must run against Firestore emulator only');
const app = initializeApp({ projectId: 'demo-dreamandgo-chat-rules' }, 'xp-reward-tests');
const db = getFirestore(app);

test('awards XP once for a persisted event and ignores duplicate delivery', async () => {
    const uid = 'xp-owner';
    await db.doc('users/' + uid).set({ stats: { xp: 10, friends: 2 } });
    const input = {
        uid, action: 'travels', sourceId: 'trip-1',
        eventKey: 'created_travels_trip-1', occurredAt: '2026-11-20T10:00:00.000Z'
    };

    const first = await awardXpForVerifiedEvent(db, input);
    const duplicate = await awardXpForVerifiedEvent(db, input);
    const profile = await db.doc('users/' + uid).get();

    assert.equal(first.awarded, true);
    assert.equal(first.xpGained, 50);
    assert.equal(first.totalXp, 60);
    assert.equal(duplicate.awarded, false);
    assert.equal(duplicate.reason, 'duplicate');
    assert.equal(profile.get('stats.xp'), 60);
    assert.equal(profile.get('stats.friends'), 2);
    assert.equal((await db.doc('users/' + uid + '/xpEvents/created_travels_trip-1').get()).exists, true);
});

test('daily limits prevent farming with newly generated event IDs', async () => {
    const uid = 'xp-daily-cap';
    await db.doc('users/' + uid).set({ stats: { xp: 0 } });
    const results = [];
    for (let i = 0; i < XP_DAILY_ACTION_LIMIT + 1; i++) {
        results.push(await awardXpForVerifiedEvent(db, {
            uid, action: 'travels', sourceId: 'trip-' + i,
            eventKey: 'created_travels_trip-' + i,
            occurredAt: '2026-11-20T11:00:00.000Z'
        }));
    }
    assert.equal(results.filter(item => item.awarded).length, XP_DAILY_ACTION_LIMIT);
    assert.equal(results.at(-1).reason, 'daily-limit');
    assert.equal((await db.doc('users/' + uid).get()).get('stats.xp'), 250);
});

test('global daily XP ceiling is enforced across reward categories', async () => {
    const uid = 'xp-global-cap';
    await db.doc('users/' + uid).set({ stats: { xp: 0 } });
    const actions = ['travels', 'restaurants', 'movies', 'books', 'dreams', 'friends'];
    let index = 0;
    for (const action of actions) {
        for (let n = 0; n < XP_DAILY_ACTION_LIMIT; n++) {
            await awardXpForVerifiedEvent(db, {
                uid, action, sourceId: action + '-' + n,
                eventKey: 'event-' + index++,
                occurredAt: '2026-11-20T12:00:00.000Z'
            });
        }
    }
    const saved = await db.doc('users/' + uid).get();
    const daily = await db.doc('users/' + uid + '/xpDaily/2026-11-20').get();
    assert.equal(daily.get('xpEarned'), XP_DAILY_LIMIT);
    assert.equal(saved.get('stats.xp'), XP_DAILY_LIMIT);
});

test('does not award when the profile is missing and rejects malformed reward requests', async () => {
    const result = await awardXpForVerifiedEvent(db, {
        uid: 'xp-no-profile', action: 'books', sourceId: 'book-1',
        eventKey: 'created_book_1', occurredAt: '2026-11-20T10:00:00.000Z'
    });
    assert.equal(result.reason, 'profile-missing');
    await assert.rejects(
        awardXpForVerifiedEvent(db, {
            uid: 'xp-owner', action: 'unknown', sourceId: 'x',
            eventKey: 'invalid', occurredAt: '2026-11-20T10:00:00.000Z'
        }),
        error => error.code === 'invalid-argument'
    );
});

test('dream completion is awarded only on a transition into completed', () => {
    assert.equal(isDreamCompletionTransition({ status: 'in_progress' }, { status: 'completed' }), true);
    assert.equal(isDreamCompletionTransition({ status: 'completed' }, { status: 'completed' }), false);
    assert.equal(isDreamCompletionTransition({ status: 'dreaming' }, { status: 'in_progress' }), false);
});

test.after(async () => { await deleteApp(app); });
