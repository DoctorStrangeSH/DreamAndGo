import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeOwnedCollections, mergeOwnedStats } from '../server/profile-stats.js';

function snapshot(records) {
    return { docs: records.map((data, index) => ({
        id: data.id || String(index),
        data: () => data
    })) };
}

test('recomputes all personal collection counters from server snapshots', () => {
    const stats = summarizeOwnedCollections({
        travels: snapshot([{ status: 'planned' }, { status: 'visited' }]),
        restaurants: snapshot([{ status: 'visited' }, { status: 'want_to_visit' }]),
        movies: snapshot([{ status: 'watched' }, { status: 'to_watch' }]),
        books: snapshot([{ status: 'read' }, { status: 'reading' }, { status: 'want_to_read' }]),
        dreams: snapshot([{ status: 'completed' }, { status: 'in_progress' }, { status: 'dreaming' }]),
        friends: snapshot([{ friendId: 'bob' }, { friendId: 'charlie' }])
    });
    assert.deepEqual(stats, {
        travels: 2, travelsPlanned: 1, travelsVisited: 1,
        restaurants: 2, restaurantsVisited: 1, restaurantsWantToVisit: 1,
        movies: 2, moviesWatched: 1, moviesToWatch: 1,
        books: 3, booksRead: 1, booksReading: 1, booksWantToRead: 1,
        dreams: 3, dreamsCompleted: 1, dreamsInProgress: 1,
        friends: 2
    });
});

test('ignores legacy initialization placeholders instead of counting them as user records', () => {
    const stats = summarizeOwnedCollections({
        travels: snapshot([{ id: '_init', created: true }, { id: 'trip-1', status: 'planned' }]),
        books: snapshot([{ id: '_init', _note: 'init' }]),
        friends: snapshot([{ id: '_init', _note: 'init' }])
    });
    assert.equal(stats.travels, 1);
    assert.equal(stats.travelsPlanned, 1);
    assert.equal(stats.books, 0);
    assert.equal(stats.booksRead, 0);
    assert.equal(stats.friends, 0);
});

test('preserves unrelated server-managed counters and replaces only computed keys', () => {
    const merged = mergeOwnedStats(
        { friends: 7, custom: 'keep', books: 99 },
        { books: 2, booksRead: 1 }
    );
    assert.deepEqual(merged, { friends: 7, custom: 'keep', books: 2, booksRead: 1 });
    assert.deepEqual(mergeOwnedStats(null, { dreams: 0 }), { dreams: 0 });
});
