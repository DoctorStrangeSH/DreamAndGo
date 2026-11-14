import test from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '../js/core/router.js';

test('replays the latest route when navigation occurs during async render', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousLog = console.log;
    let releaseFirst;
    const gate = new Promise((resolve) => { releaseFirst = resolve; });
    const visited = [];
    try {
        console.log = () => {};
        globalThis.window = { location: { hash: '#first' } };
        globalThis.document = { title: '', querySelectorAll: () => [] };
        const router = new Router();
        router.register('first', { async render() {
            visited.push('first');
            await gate;
        } }, { requiresAuth: false });
        router.register('second', { async render() {
            visited.push('second');
        } }, { requiresAuth: false });

        const firstRender = router.handleRoute();
        await Promise.resolve();
        window.location.hash = '#second';
        await router.handleRoute();
        releaseFirst();
        await firstRender;
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.deepEqual(visited, ['first', 'second']);
        assert.equal(router.getCurrentRoute(), 'second');
        await new Promise((resolve) => setTimeout(resolve, 60));
    } finally {
        console.log = previousLog;
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
    }
});
