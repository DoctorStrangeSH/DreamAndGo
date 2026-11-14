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

test('unauthenticated visitors cannot render private routes', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousLog = console.log;
    const previousWarn = console.warn;
    let privateRenders = 0;
    try {
        console.log = () => {};
        console.warn = () => {};
        globalThis.window = { location: { hash: '#private' }, app: { currentUser: null } };
        globalThis.document = { title: '', querySelectorAll: () => [] };
        const router = new Router();
        router.register('private', { render() { privateRenders++; } });
        router.register('auth', { render() {} }, { requiresAuth: false });
        await router.handleRoute();
        assert.equal(privateRenders, 0);
        assert.notEqual(router.getCurrentRoute(), 'private');
        assert.equal(window.location.hash, 'auth');
        await router.handleRoute();
        assert.equal(router.getCurrentRoute(), 'auth');
        await new Promise(resolve => setTimeout(resolve, 60));
    } finally {
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
        console.log = previousLog;
        console.warn = previousWarn;
    }
});
