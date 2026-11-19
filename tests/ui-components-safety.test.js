import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/core/ui-components.js', import.meta.url), 'utf8');
const extract = (start, end) => {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from);
    return source.slice(from, to);
};
const methods = extract('    createModal(', '    // Toast уведомления') +
    extract('    createEmptyState(', '    // Бейдж рейтинга');
const esc = value => String(value ?? '').replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const Component = new Function('escapeHTML', `return class Component { ${methods} }`)(esc);

test('dialog treats title and element ID as text, not markup', () => {
    const html = new Component().createModal({
        id: 'my" onclick="evil()', title: '<img src=x onerror=evil()>',
        size: 'lg" onclick="evil()', content: '<p>Trusted content</p>'
    });
    assert.match(html, /id="my&quot; onclick=&quot;evil\(\)"/);
    assert.match(html, /&lt;img src=x onerror=evil\(\)&gt;/);
    assert.match(html, /modal-md modal-dialog-centered/);
    assert.match(html, /aria-label="Закрыть окно"/);
    assert.match(html, /<p>Trusted content<\/p>/);
});

test('empty state escapes text and accepts only icon classes', () => {
    const html = new Component().createEmptyState({
        icon: 'bi-star" onmouseover="evil()',
        title: '<script>evil()</script>',
        description: '<b>private</b>'
    });
    assert.match(html, /bi bi-info-circle/);
    assert.match(html, /&lt;script&gt;evil\(\)&lt;\/script&gt;/);
    assert.match(html, /&lt;b&gt;private&lt;\/b&gt;/);
    assert.doesNotMatch(html, /<script>|onmouseover=/);
});
