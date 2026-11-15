import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatV2ActiveRefresh } from '../js/core/chat-v2-active-refresh.js';

test('active refresh only runs while visible and stops on disposal', async () => {
    let callback, cancelled, visible = true, refreshes = 0;
    const clock = new ChatV2ActiveRefresh({
        refresh: async () => { refreshes++; },
        isVisible: () => visible,
        schedule: fn => { callback = fn; return 42; },
        cancel: id => { cancelled = id; }
    });
    clock.start();
    await clock.tick();
    assert.equal(refreshes, 1);
    visible = false;
    await clock.tick();
    assert.equal(refreshes, 1);
    visible = true;
    callback();
    await Promise.resolve();
    assert.equal(refreshes, 2);
    clock.stop();
    assert.equal(cancelled, 42);
    await clock.tick();
    assert.equal(refreshes, 2);
});
test('active refresh deduplicates overlapping requests and tolerates offline errors', async () => {
    let finish, calls = 0;
    const clock = new ChatV2ActiveRefresh({
        refresh: () => {
            calls++;
            if (calls === 1) return new Promise(resolve => { finish = resolve; });
            return Promise.reject(new Error('offline'));
        },
        schedule: () => 1,
        cancel: () => {}
    });
    clock.start();
    const waiting = clock.tick();
    await clock.tick();
    assert.equal(calls, 1);
    finish();
    await waiting;
    await clock.tick();
    assert.equal(calls, 2);
    clock.stop();
});
test('active refresh rejects overly aggressive polling', () => {
    assert.throws(() => new ChatV2ActiveRefresh({
        refresh: () => {}, intervalMs: 1000
    }), TypeError);
});
