import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHTML } from '../js/core/escape-html.js';

test('escapes HTML markup, attributes and ampersands', () => {
    assert.equal(escapeHTML('<img src="x" onerror=\'alert(1)\'>&'), '&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;&amp;');
});

test('handles nullish and non-string values', () => {
    assert.equal(escapeHTML(null), '');
    assert.equal(escapeHTML(undefined), '');
    assert.equal(escapeHTML(42), '42');
});

test('preserves readable Unicode', () => {
    assert.equal(escapeHTML('Мечта ✨'), 'Мечта ✨');
});
