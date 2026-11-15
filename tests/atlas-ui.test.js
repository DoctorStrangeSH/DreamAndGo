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
