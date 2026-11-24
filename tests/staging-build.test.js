import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAG_NAMES } from '../scripts/staging-preflight.mjs';
import { renderStagingFirebaseModule, renderStagingIndex } from '../scripts/build-staging.mjs';

function validConfig() {
    return {
        firebaseConfig: {
            projectId: 'dreamandgo-staging',
            apiKey: 'AIza' + 'A'.repeat(32),
            authDomain: 'dreamandgo-staging.firebaseapp.com',
            appId: '1:123456789:web:abc123',
            messagingSenderId: '123456789',
            storageBucket: 'dreamandgo-staging.firebasestorage.app',
            measurementId: 'G-ABC123'
        },
        appCheckSiteKey: 'sitekey' + 'A'.repeat(32),
        rolloutFlags: Object.fromEntries(FLAG_NAMES.map(name => [name, false])),
        serviceAccountPrivateKey: 'must-never-be-copied-into-the-browser'
    };
}

function sourceIndex() {
    const flags = FLAG_NAMES.map(name => `<meta name="${name}" content="false">`).join('\n');
    return `<!doctype html>
<html lang="ru">
<head>
<meta name="firebase-app-check-site-key" content="">
${flags}
</head>
<body><script type="module" src="js/app.js"></script></body>
</html>`;
}

test('staging build embeds the isolated public Firebase config and App Check key', () => {
    const config = validConfig();
    const html = renderStagingIndex(sourceIndex(), config);
    assert.match(html, /name="dreamandgo-environment" content="staging"/);
    assert.match(html, new RegExp(`name="firebase-app-check-site-key" content="${config.appCheckSiteKey}"`));
    for (const flag of FLAG_NAMES) {
        assert.match(html, new RegExp(`name="${flag}" content="false"`));
    }

    const embedded = html.match(/<script id="dreamandgo-firebase-config" type="application\/json">([\s\S]*?)<\/script>/);
    assert.ok(embedded, 'runtime Firebase config must be embedded');
    const runtimeConfig = JSON.parse(embedded[1]);
    assert.equal(runtimeConfig.projectId, config.firebaseConfig.projectId);
    assert.equal(runtimeConfig.authDomain, config.firebaseConfig.authDomain);
    assert.equal(runtimeConfig.apiKey, config.firebaseConfig.apiKey);
    assert.equal(runtimeConfig.measurementId, 'G-ABC123');
    assert.equal('serviceAccountPrivateKey' in runtimeConfig, false);
    assert.equal(html.includes('must-never-be-copied-into-the-browser'), false);
    assert.equal(html.includes('dream-and-go.firebaseapp.com'), false);
});

test('staging build refuses rollout flags that are not explicitly false in source HTML', () => {
    const html = sourceIndex().replace('name="chat-v2-enabled" content="false"', 'name="chat-v2-enabled" content="true"');
    assert.throws(() => renderStagingIndex(html, validConfig()), /Rollout flag chat-v2-enabled/);
});

test('staging build rejects invalid Firebase config and a template without App Check meta', () => {
    const invalid = validConfig();
    invalid.firebaseConfig.projectId = 'dream-and-go';
    assert.throws(() => renderStagingIndex(sourceIndex(), invalid), /Staging preflight failed/);
    assert.throws(() => renderStagingIndex('<html><head></head></html>', validConfig()), /firebase-app-check-site-key/);
});

test('staging build refuses to inject a second runtime configuration', () => {
    const html = sourceIndex().replace('</head>', '<meta name="dreamandgo-environment" content="staging"></head>');
    assert.throws(() => renderStagingIndex(html, validConfig()), /staging runtime config/);
});

test('staging build omits unsupported optional metadata and removes production fallback', () => {
    const config = validConfig();
    config.firebaseConfig.measurementId = '<script>alert(1)</script>';
    const html = renderStagingIndex(sourceIndex(), config);
    const embedded = html.match(/<script id="dreamandgo-firebase-config" type="application\/json">([\s\S]*?)<\/script>/);
    assert.ok(embedded);
    assert.equal(JSON.parse(embedded[1]).measurementId, undefined);
    assert.equal(html.includes('<script>alert(1)</script>'), false);

    const productionModule = 'const PRODUCTION_FIREBASE_CONFIG = Object.freeze({\n    projectId: "dream-and-go"\n});\nexport const app = null;';
    const stagingModule = renderStagingFirebaseModule(productionModule);
    assert.match(stagingModule, /PRODUCTION_FIREBASE_CONFIG = null/);
    assert.equal(stagingModule.includes('dream-and-go'), false);
    assert.throws(() => renderStagingFirebaseModule('no firebase config here'), /production Firebase config block/);
});
