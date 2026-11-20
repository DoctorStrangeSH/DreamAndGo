import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { refreshUserStatsTransaction } from './profile-stats.js';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Must run against Firestore emulator only');
const app = initializeApp({ projectId: 'demo-dreamandgo-chat-rules' }, 'profile-stats-tests');
const db = getFirestore(app);

test('server recomputes owned collection stats and preserves unrelated profile counters', async () => {
    const uid = 'profile-stats-owner';
    const user = db.doc('users/' + uid);
    await user.set({ email: 'owner@example.test', username: 'owner', stats: { friends: 4, customCounter: 12 } });
    await Promise.all([
        db.doc('users/' + uid + '/travels/trip-1').set({ status: 'planned' }),
        db.doc('users/' + uid + '/travels/trip-2').set({ status: 'visited' }),
        db.doc('users/' + uid + '/travels/_init').set({ _note: 'legacy placeholder' }),
        db.doc('users/' + uid + '/books/book-1').set({ status: 'read' }),
        db.doc('users/' + uid + '/books/book-2').set({ status: 'reading' }),
        db.doc('users/' + uid + '/movies/movie-1').set({ status: 'watched' }),
        db.doc('users/' + uid + '/restaurants/restaurant-1').set({ status: 'want_to_visit' }),
        db.doc('users/' + uid + '/dreams/dream-1').set({ status: 'completed' }),
        db.doc('users/' + uid + '/friends/bob').set({ friendId: 'bob' }),
        db.doc('users/' + uid + '/friends/charlie').set({ friendId: 'charlie' }),
        db.doc('users/' + uid + '/xpEvents/travel-week-1').set({ action: 'travels', xpGained: 50, occurredAt: new Date() }),
        db.doc('users/' + uid + '/xpEvents/travel-week-2').set({ action: 'travels', xpGained: 50, occurredAt: new Date() }),
        db.doc('users/' + uid + '/xpEvents/restaurant-week-1').set({ action: 'restaurants', xpGained: 30, occurredAt: new Date() }),
        db.doc('users/' + uid + '/xpEvents/restaurant-week-2').set({ action: 'restaurants', xpGained: 30, occurredAt: new Date() }),
        db.doc('users/' + uid + '/xpEvents/movie-week-1').set({ action: 'movies', xpGained: 20, occurredAt: new Date() }),
        db.doc('users/' + uid + '/xpEvents/book-week-1').set({ action: 'books', xpGained: 25, occurredAt: new Date() }),
        db.doc('users/' + uid + '/xpEvents/dream-week-1').set({ action: 'dreams', xpGained: 15, occurredAt: new Date() }),
        db.doc('users/' + uid + '/xpEvents/friend-week-excluded').set({ action: 'friends', xpGained: 40, occurredAt: new Date() }),
        db.doc('users/' + uid + '/xpEvents/old-week-excluded').set({ action: 'travels', xpGained: 50, occurredAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) })
    ]);

    const result = await refreshUserStatsTransaction(db, uid);
    assert.equal(result.travels, 2);
    assert.equal(result.travelsPlanned, 1);
    assert.equal(result.travelsVisited, 1);
    assert.equal(result.books, 2);
    assert.equal(result.booksRead, 1);
    assert.equal(result.booksReading, 1);
    assert.equal(result.moviesWatched, 1);
    assert.equal(result.restaurantsWantToVisit, 1);
    assert.equal(result.dreamsCompleted, 1);
    assert.equal(result.friends, 2);
    assert.equal(result.weeklyActivityCount, 7);
    assert.ok(result.newAchievements.some(item => item.id === 'perfect_week'));

    const saved = await user.get();
    assert.equal(saved.get('stats.customCounter'), 12);
    assert.equal(saved.get('stats.travels'), 2);
    assert.equal(saved.get('stats.travelsPlanned'), 1);
    assert.equal(saved.get('stats.friends'), 2);
    assert.ok(Array.isArray(saved.get('achievements')));
    assert.ok(saved.get('achievements').length > 0);

    const repeated = await refreshUserStatsTransaction(db, uid);
    assert.equal(repeated.newAchievements.length, 0);
    const afterRepeat = await user.get();
    assert.equal(afterRepeat.get('achievements').length, saved.get('achievements').length);
});

test('server refuses to create or mutate a missing profile during stats refresh', async () => {
    await assert.rejects(
        refreshUserStatsTransaction(db, 'profile-stats-missing'),
        error => error.code === 'not-found'
    );
    assert.equal((await db.doc('users/profile-stats-missing').get()).exists, false);
});

test.after(async () => { await deleteApp(app); });
