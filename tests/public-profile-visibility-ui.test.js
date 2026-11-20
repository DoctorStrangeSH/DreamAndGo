import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settings = readFileSync(new URL('../js/modules/settings/settings.js', import.meta.url), 'utf8');
const client = readFileSync(new URL('../js/services/public-profile-callable.service.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');

test('settings expose explicit public profile opt-in with a private-by-default state', () => {
    assert.match(settings, /id="publicProfileEnabled"/);
    assert.match(settings, /userData\.publicProfileEnabled === true \? 'checked' : ''/);
    assert.match(settings, /Email, город, личные записи и настройки не публикуются/);
    assert.match(settings, /setPublicProfileVisibility\(requested\)/);
    assert.match(settings, /visibilityToggle\.checked = !requested/);
});

test('visibility changes are sent only through the App Check callable', () => {
    assert.match(client, /setPublicProfileVisibilityV2/);
    assert.match(server, /setPublicProfileVisibilityV2 = onCall\(\{ region: 'europe-west3', enforceAppCheck: true \}/);
    assert.doesNotMatch(settings, /updateDoc\([^\n]*publicProfileEnabled/);
});
