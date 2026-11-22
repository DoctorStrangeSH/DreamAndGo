import test from 'node:test';
import assert from 'node:assert/strict';
import {
    escapeHTML,
    safeCount,
    safeDocumentId,
    safeHttpsURL,
    safeIconClass,
    safeInternalRoute
} from '../js/core/security.js';

test('escapeHTML encodes markup and quote characters', () => {
    assert.equal(
        escapeHTML(`<img src=x onerror="alert('x')">&`),
        '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;'
    );
});

test('safeInternalRoute allows only known application routes', () => {
    assert.equal(safeInternalRoute('#books'), '#books');
    assert.equal(safeInternalRoute('profile/user_123'), '#profile/user_123');
    assert.equal(safeInternalRoute('javascript:alert(1)'), '');
    assert.equal(safeInternalRoute('admin'), '');
    assert.equal(safeInternalRoute('chat/other-user'), '');
});

test('safeDocumentId rejects path separators and oversized identifiers', () => {
    assert.equal(safeDocumentId('user_123-abc'), 'user_123-abc');
    assert.equal(safeDocumentId('../private'), '');
    assert.equal(safeDocumentId('a'.repeat(129)), '');
    assert.equal(safeDocumentId(null), '');
});

test('safeCount clamps invalid, negative and oversized values', () => {
    assert.equal(safeCount('12.9'), 12);
    assert.equal(safeCount(-4), 0);
    assert.equal(safeCount(Infinity), 0);
    assert.equal(safeCount(100_000), 9999);
});

test('safeHttpsURL accepts only credential-free HTTPS URLs', () => {
    assert.equal(safeHttpsURL('https://example.com/path'), 'https://example.com/path');
    assert.equal(safeHttpsURL('javascript:alert(1)'), '');
    assert.equal(safeHttpsURL('http://example.com'), '');
    assert.equal(safeHttpsURL('https://user:pass@example.com'), '');
});

test('safeIconClass accepts only Bootstrap icon class names', () => {
    assert.equal(safeIconClass('bi-heart-fill'), 'bi-heart-fill');
    assert.equal(safeIconClass('bi-heart onmouseover=alert(1)'), 'bi-bell');
    assert.equal(safeIconClass(null, 'bi-star'), 'bi-star');
});
