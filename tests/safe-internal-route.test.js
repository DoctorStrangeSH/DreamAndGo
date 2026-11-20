import test from 'node:test';
import assert from 'node:assert/strict';
import { safeInternalRoute } from '../js/core/safe-internal-route.js';
import { escapeHTML } from '../js/core/escape-html.js';

test('safeInternalRoute accepts only explicitly allowlisted routes', () => {
    assert.equal(safeInternalRoute('#friends', ['#friends', '#chat']), '#friends');
    assert.equal(safeInternalRoute('#admin', ['#friends', '#chat']), '');
    assert.equal(safeInternalRoute('https://evil.example', ['#friends']), '');
    assert.equal(safeInternalRoute('javascript:alert(1)', ['#friends']), '');
});

test('safeInternalRoute accepts profile routes only with a constrained UID', () => {
    const allowed = ['#profile/:uid'];
    assert.equal(safeInternalRoute('#profile/abc_123-XYZ', allowed), '#profile/abc_123-XYZ');
    assert.equal(safeInternalRoute('#profile/<img>', allowed), '');
    assert.equal(safeInternalRoute('#profile/a/b', allowed), '');
    assert.equal(safeInternalRoute('#profile/', allowed), '');
});

test('escapeHTML neutralizes markup and quoted attribute payloads', () => {
    assert.equal(
        escapeHTML('<img src=x onerror="alert(1)"> & \'hello\''),
        '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;hello&#39;'
    );
});
