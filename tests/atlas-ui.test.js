import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

test('Atlas CSS layers are included in the site entry point', () => {
  const html = read('index.html');
  const sheets = [
    'css/style.css',
    'css/atlas-theme.css',
    'css/atlas-pages.css',
    'css/atlas-illustrations.css',
    'css/atlas-dialogs.css'
  ];
  let previous = -1;
  for (const sheet of sheets) {
    const index = html.indexOf('href="' + sheet + '"');
    assert.ok(index > previous, sheet + ' must load after the previous layer');
    previous = index;
    assert.ok(read(sheet).length > 100, sheet + ' must exist and contain CSS');
  }
});

test('Atlas empty states connect their actions without inline scripts', () => {
  for (const [name, label] of [['travels', 'Travel'], ['dreams', 'Dream'], ['books', 'Book']]) {
    const source = read('js/modules/' + name + '/' + name + '.js');
    assert.match(source, new RegExp('id="emptyAdd' + label + 'Btn"'));
    assert.match(source, new RegExp("getElementById\\('emptyAdd" + label + "Btn'\\)\\?\\.addEventListener"));
    assert.doesNotMatch(source, /onclick="document\.getElementById\('add/);
    assert.match(source, /e\.currentTarget\.dataset\.filter/);
  }
});


test('travel cards escape user-supplied attributes and text', () => {
  const source = read('js/modules/travels/travels.js');
  for (const field of ['travel.title', 'travel.location', 'travel.photos[0]', 'travel.id']) {
    assert.ok(source.includes('escapeHTML(' + field + ')'), field + ' must be escaped');
  }
  assert.match(source, /escapeHTML\(String\(travel\.description\)\.substring\(0, 100\)\)/);
});


test('icon-only card actions have accessible labels', () => {
  for (const name of ['travels', 'dreams', 'books']) {
    const source = read('js/modules/' + name + '/' + name + '.js');
    const edit = source.match(/<button[^>]*class="[^"]*edit-btn"[^>]*>/);
    const remove = source.match(/<button[^>]*class="[^"]*delete-btn"[^>]*>/);
    assert.ok(edit, name + ': edit button exists');
    assert.ok(remove, name + ': delete button exists');
    assert.match(edit[0], /aria-label="Редактировать запись"/);
    assert.match(remove[0], /aria-label="Удалить запись"/);
  }
});


test('design preview is isolated from production services', () => {
  const html = read('design/atlas-preview.html');
  assert.match(html, /Atlas/);
  for (const stylesheet of ['atlas-theme.css', 'atlas-pages.css', 'atlas-illustrations.css', 'atlas-dialogs.css']) {
    assert.ok(html.includes('../css/' + stylesheet), stylesheet + ' is included');
  }
  assert.doesNotMatch(html, /(?:firebase\/|firebaseapp\.com|https?:\/\/|<script\s+src=)/i);
  assert.doesNotMatch(html, /(?:fetch\s*\(|XMLHttpRequest|localStorage|indexedDB)/);
});
