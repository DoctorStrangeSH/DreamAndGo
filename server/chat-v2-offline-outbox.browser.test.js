import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const outboxModule = await readFile(
    new URL('../js/services/chat-v2-offline-outbox.js', import.meta.url),
    'utf8'
);

async function withBrowserFixture(run) {
    const server = createServer((request, response) => {
        if (request.url === '/chat-v2-offline-outbox.js') {
            response.writeHead(200, {
                'content-type': 'text/javascript; charset=utf-8',
                'cache-control': 'no-store'
            });
            response.end(outboxModule);
            return;
        }
        if (request.url !== '/') {
            response.writeHead(404);
            response.end();
            return;
        }
        response.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store'
        });
        response.end(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Chat outbox browser test</title></head>
<body>
<script type="module">
    import {
        createEncryptedChatOutbox,
        createIndexedDbChatOutbox,
        flushEncryptedChatOutbox
    } from '/chat-v2-offline-outbox.js';

    const store = createIndexedDbChatOutbox();
    const outbox = createEncryptedChatOutbox({ store });
    window.outbox = outbox;
    window.store = store;
    window.sent = [];
    window.enqueue = record => outbox.enqueue(record);
    window.listMessages = (uid, chatId) => outbox.list(uid, chatId);
    window.flush = uid => flushEncryptedChatOutbox({
        outbox,
        uid,
        isOnline: () => navigator.onLine,
        sendMessage: async payload => {
            window.sent.push(payload);
            return { success: true, messageId: 'server-' + payload.clientMessageId };
        }
    });
    window.outboxReady = true;
</script>
</body>
</html>`);
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(`http://127.0.0.1:${address.port}/`);
        await page.waitForFunction(() => window.outboxReady === true);
        await run({ browser, context, page });
    } finally {
        await context.close();
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
}

test('real Chromium IndexedDB restores encrypted messages and non-extractable keys after reload', async () => {
    await withBrowserFixture(async ({ page }) => {
        const beforeReload = await page.evaluate(async () => {
            await window.enqueue({
                uid: 'browser-alice',
                chatId: 'browser-chat',
                text: 'persist through a real page reload',
                messageId: 'browser-persist-1'
            });
            const records = await window.store.listMessages('browser-alice');
            const key = await window.store.getKey('browser-alice');
            return {
                recordCount: records.length,
                plaintextStored: records[0].ciphertext.includes('persist through a real page reload'),
                keyExtractable: key.extractable
            };
        });

        assert.deepEqual(beforeReload, {
            recordCount: 1,
            plaintextStored: false,
            keyExtractable: false
        });

        await page.reload();
        await page.waitForFunction(() => window.outboxReady === true);
        const afterReload = await page.evaluate(async () => {
            const [message] = await window.listMessages('browser-alice', 'browser-chat');
            const key = await window.store.getKey('browser-alice');
            return {
                text: message?.text,
                messageId: message?.id,
                deliveryState: message?.deliveryState,
                keyExtractable: key?.extractable
            };
        });

        assert.deepEqual(afterReload, {
            text: 'persist through a real page reload',
            messageId: 'browser-persist-1',
            deliveryState: 'queued',
            keyExtractable: false
        });
    });
});

test('real browser offline queue resumes delivery after reconnect with the original idempotency ID', async () => {
    await withBrowserFixture(async ({ context, page }) => {
        await context.setOffline(true);
        const offlineState = await page.evaluate(async () => {
            await window.enqueue({
                uid: 'browser-alice',
                chatId: 'browser-chat',
                text: 'deliver after reconnect',
                messageId: 'browser-retry-1'
            });
            const result = await window.flush('browser-alice');
            return {
                online: navigator.onLine,
                sent: result.sent,
                remaining: result.remaining,
                queued: (await window.listMessages('browser-alice')).length
            };
        });
        assert.deepEqual(offlineState, {
            online: false,
            sent: 0,
            remaining: 1,
            queued: 1
        });

        await context.setOffline(false);
        await page.waitForFunction(() => navigator.onLine === true);
        const onlineState = await page.evaluate(async () => {
            const result = await window.flush('browser-alice');
            return {
                sent: result.sent,
                remaining: result.remaining,
                queued: (await window.listMessages('browser-alice')).length,
                sentIds: window.sent.map(message => message.clientMessageId),
                sentText: window.sent.map(message => message.text)
            };
        });
        assert.deepEqual(onlineState, {
            sent: 1,
            remaining: 0,
            queued: 0,
            sentIds: ['browser-retry-1'],
            sentText: ['deliver after reconnect']
        });
    });
});

test('two real browser tabs share one account key and preserve both concurrent queue writes', async () => {
    await withBrowserFixture(async ({ context, page }) => {
        const secondTab = await context.newPage();
        await secondTab.goto(page.url());
        await secondTab.waitForFunction(() => window.outboxReady === true);

        await Promise.all([
            page.evaluate(() => window.enqueue({
                uid: 'browser-alice',
                chatId: 'browser-chat',
                text: 'message from first tab',
                messageId: 'browser-tab-1'
            })),
            secondTab.evaluate(() => window.enqueue({
                uid: 'browser-alice',
                chatId: 'browser-chat',
                text: 'message from second tab',
                messageId: 'browser-tab-2'
            }))
        ]);

        await page.reload();
        await page.waitForFunction(() => window.outboxReady === true);
        const result = await page.evaluate(async () => {
            const messages = await window.listMessages('browser-alice', 'browser-chat');
            const key = await window.store.getKey('browser-alice');
            return {
                texts: messages.map(message => message.text).sort(),
                ids: messages.map(message => message.id).sort(),
                keyExtractable: key.extractable
            };
        });

        assert.deepEqual(result, {
            texts: ['message from first tab', 'message from second tab'],
            ids: ['browser-tab-1', 'browser-tab-2'],
            keyExtractable: false
        });
        await secondTab.close();
    });
});

test('real browser keeps each account queue isolated after reload', async () => {
    await withBrowserFixture(async ({ page }) => {
        await page.evaluate(async () => {
            await Promise.all([
                window.enqueue({
                    uid: 'browser-alice',
                    chatId: 'browser-chat',
                    text: 'Alice private draft',
                    messageId: 'browser-alice-1'
                }),
                window.enqueue({
                    uid: 'browser-bob',
                    chatId: 'browser-chat',
                    text: 'Bob private draft',
                    messageId: 'browser-bob-1'
                })
            ]);
        });

        await page.reload();
        await page.waitForFunction(() => window.outboxReady === true);
        const result = await page.evaluate(async () => ({
            alice: (await window.listMessages('browser-alice')).map(message => message.text),
            bob: (await window.listMessages('browser-bob')).map(message => message.text),
            unrelated: await window.listMessages('browser-mallory')
        }));

        assert.deepEqual(result, {
            alice: ['Alice private draft'],
            bob: ['Bob private draft'],
            unrelated: []
        });
    });
});
