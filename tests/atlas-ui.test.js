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
  for (const field of ["travel.title || 'Без названия'", 'travel.location', 'travel.id']) {
    assert.ok(source.includes('escapeHTML(' + field + ')') ||
      source.includes('escapeHTML(String(' + field + '))'), field + ' must be escaped');
  }
  assert.match(source, /escapeHTML\(photoURL\)/);
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

test('offline preview buttons support a non-persistent interactive walkthrough', () => {
  const html = read('design/atlas-preview.html');
  assert.match(html, /id="previewTravelForm"/);
  assert.match(html, /data-preview-action="new-travel"/);
  assert.match(html, /data-preview-action="new-book"/);
  assert.match(html, /id="previewFeedback"[^>]*role="status"/);
  assert.match(html, /form\.addEventListener\('submit'/);
  assert.match(html, /event\.preventDefault\(\)/);
  assert.match(html, /heading\.textContent=title/);
  assert.match(html, /description\.textContent=note/);
  assert.doesNotMatch(html, /innerHTML\s*=/);
});

test('real profile provides keyboard accessible tabs without refetching on each switch', () => {
  const source = read('js/modules/profile/profile.js');
  assert.match(source, /role="tablist" aria-label="Разделы профиля"/);
  assert.match(source, /role="tabpanel" tabindex="0"/);
  for (const tab of ['overview', 'travels', 'movies', 'books', 'dreams', 'restaurants', 'achievements']) {
    assert.ok(source.includes('id="profile-tab-' + tab + '"'), tab + ': tab ID');
  }
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
    assert.ok(source.includes("event.key === '" + key + "'"), key + ': keyboard navigation');
  }
  assert.match(source, /setAttribute\('aria-selected', String\(selected\)\)/);
  assert.match(source, /this\.initTabs\(userData\)/);
  assert.doesNotMatch(source, /this\.loadUserProfile\(userId\);\s*if \(userData\)/);
});

test('real profile uses Atlas cards and achievement empty state', () => {
  const profile = read('js/modules/profile/profile.js');
  const pages = read('css/atlas-pages.css');
  const art = read('css/atlas-illustrations.css');
  assert.match(profile, /atlas-empty--achievement/);
  assert.match(profile, /Первая награда впереди/);
  assert.match(pages, /\.profile-page \.profile-stats \{display:grid/);
  assert.match(pages, /\.profile-page \.profile-tabs \.nav-link\[aria-selected="true"\]/);
  assert.match(art, /\.atlas-empty--achievement/);
});

test('profile travel collection only reads for its authenticated owner', () => {
  const profile = read('js/modules/profile/profile.js');
  assert.match(profile, /if \(!this\.profileIsOwn \|\| window\.app\.currentUser\?\.uid !== this\.profileUserId\)/);
  assert.match(profile, /new TravelService\(\)\.getTravels\(this\.profileUserId\)/);
  assert.match(profile, /requestId !== this\.tabRequestId/);
  assert.match(profile, /escapeHTML\(String\(travel\.title \|\| 'Без названия'\)\)/);
  assert.match(profile, /escapeHTML\(String\(travel\.location \|\| 'Место не указано'\)\)/);
  assert.doesNotMatch(profile, /getTravels\(userId\)/);
});

test('private dreams collection is owner-only and escapes display fields', () => {
  const source = read('js/modules/profile/profile.js');
  assert.match(source, /case 'dreams':\s*await this\.loadOwnDreams\(container, requestId\)/);
  assert.match(source, /async loadOwnDreams\(container, requestId\)/);
  assert.match(source, /if \(!this\.profileIsOwn \|\| window\.app\.currentUser\?\.uid !== this\.profileUserId\)/);
  assert.match(source, /new DreamsService\(\)\.getDreams\(this\.profileUserId\)/);
  assert.match(source, /escapeHTML\(String\(dream\.title \|\| 'Без названия'\)\)/);
  assert.match(source, /escapeHTML\(String\(dream\.category \|\| 'Личная мечта'\)\)/);
});

test('private movie collection is owner-only and escapes display fields', () => {
  const source = read('js/modules/profile/profile.js');
  assert.match(source, /case 'movies':\s*await this\.loadOwnMovies\(container, requestId\)/);
  assert.match(source, /async loadOwnMovies\(container, requestId\)/);
  assert.match(source, /new MovieService\(\)\.getUserMovies\(this\.profileUserId\)/);
  assert.match(source, /escapeHTML\(String\(movie\.title \|\| 'Без названия'\)\)/);
  assert.match(source, /escapeHTML\(String\(movie\.releaseDate \|\| 'Дата выхода не указана'\)\)/);
  assert.doesNotMatch(source, /getUserMovies\(userId\)/);
});

test('private book collection is owner-only and escapes display fields', () => {
  const source = read('js/modules/profile/profile.js');
  assert.match(source, /case 'books':\s*await this\.loadOwnBooks\(container, requestId\)/);
  assert.match(source, /async loadOwnBooks\(container, requestId\)/);
  assert.match(source, /new BookService\(\)\.getBooks\(this\.profileUserId\)/);
  assert.match(source, /escapeHTML\(String\(book\.title \|\| 'Без названия'\)\)/);
  assert.match(source, /escapeHTML\(String\(book\.author \|\| 'Автор не указан'\)\)/);
  assert.doesNotMatch(source, /getBooks\(userId\)/);
});

test('all private profile tabs guard user identity and stale requests', () => {
  const source = read('js/modules/profile/profile.js');
  for (const name of ['Travels', 'Dreams', 'Movies', 'Books', 'Restaurants']) {
    const start = source.indexOf('async loadOwn' + name + '(container, requestId)');
    assert.ok(start >= 0, name + ' loader');
    const next = source.indexOf('\n    async ', start + 10);
    const method = source.slice(start, next < 0 ? undefined : next);
    assert.match(method, /if \(!this\.profileIsOwn \|\| window\.app\.currentUser\?\.uid !== this\.profileUserId\)/);
    assert.match(method, /requestId !== this\.tabRequestId \|\| !container\.isConnected/);
  }
});

test('private restaurant collection is owner-only and escapes display fields', () => {
  const source = read('js/modules/profile/profile.js');
  assert.match(source, /case 'restaurants':\s*await this\.loadOwnRestaurants\(container, requestId\)/);
  assert.match(source, /async loadOwnRestaurants\(container, requestId\)/);
  assert.match(source, /new RestaurantService\(\)\.getRestaurants\(this\.profileUserId\)/);
  assert.match(source, /escapeHTML\(String\(restaurant\.name \|\| 'Без названия'\)\)/);
  assert.match(source, /escapeHTML\(String\(restaurant\.cuisine \|\| 'Кухня не указана'\)\)/);
  assert.doesNotMatch(source, /getRestaurants\(userId\)/);
});

test('restaurant cards and edit form escape saved content and validate photos', () => {
  const source = read('js/modules/restaurants/restaurants.js');
  assert.match(source, /import \{ escapeHTML \} from '\.\.\/\.\.\/core\/escape-html\.js'/);
  assert.match(source, /safeAvatarURL\(restaurant\.photos\?\.\[0\]\)/);
  for (const field of ['name', 'cuisine', 'address']) {
    assert.ok(source.includes('escapeHTML(String(restaurant.' + field), field + ' is escaped in cards');
  }
  assert.match(source, /escapeHTML\(String\(restaurant\.review\)\.substring\(0, 100\)\)/);
  assert.match(source, /escapeHTML\(restaurant\.favoriteDishes\.slice\(0, 2\)\.join\(', '\)\)/);
  assert.match(source, /escapeHTML\(String\(restaurant\?\.name \|\| ''\)\)/);
  assert.match(source, /escapeHTML\(String\(restaurant\?\.review \|\| ''\)\)/);
  assert.match(source, /aria-label="Редактировать ресторан"/);
  assert.match(source, /aria-label="Удалить ресторан"/);
  assert.match(source, /this\.currentFilter\.status = e\.currentTarget\.dataset\.filter/);
  assert.doesNotMatch(source, /<img src="\$\{restaurant\.photos\[0\]\}/);
});

test('movie cards and dialogs escape text and validate poster URLs', () => {
  const source = read('js/modules/movies/movies.js');
  assert.match(source, /safeAvatarURL\(movie\.poster\)/);
  assert.match(source, /safeAvatarURL\(movieData\.poster\)/);
  assert.match(source, /safeAvatarURL\(details\.poster\)/);
  assert.match(source, /escapeHTML\(String\(movie\.title \|\| 'Без названия'\)\)/);
  assert.match(source, /escapeHTML\(String\(movieData\.review \|\| ''\)\)/);
  assert.match(source, /escapeHTML\(String\(details\.review\)\)/);
  assert.match(source, /escapeHTML\(String\(details\.overview \|\| ''\)\)/);
  assert.match(source, /escapeHTML\(String\(movie\.id\)\)/);
  assert.match(source, /aria-label="Редактировать фильм"/);
  assert.match(source, /aria-label="Удалить фильм"/);
  assert.match(source, /this\.switchTab\(e\.currentTarget\.dataset\.tab\)/);
  assert.match(source, /this\.currentFilter\.status = e\.currentTarget\.dataset\.filter/);
  assert.doesNotMatch(source, /<img src="\$\{movie\.poster\}/);
  assert.doesNotMatch(source, /<img src="\$\{details\.poster\}/);
});

test('book cards and editing form safely render private library content', () => {
  const source = read('js/modules/books/books.js');
  assert.match(source, /import \{ escapeHTML \} from '\.\.\/\.\.\/core\/escape-html\.js'/);
  assert.match(source, /escapeHTML\(String\(book\.title \|\| 'Без названия'\)\)/);
  assert.match(source, /escapeHTML\(String\(book\.author \|\| 'Автор не указан'\)\)/);
  assert.match(source, /escapeHTML\(String\(g\)\)/);
  assert.match(source, /escapeHTML\(String\(book\?\.title \|\| ''\)\)/);
  assert.match(source, /escapeHTML\(String\(book\?\.review \|\| ''\)\)/);
  assert.match(source, /escapeHTML\(Array\.isArray\(book\?\.quotes\)/);
  assert.match(source, /Object\.hasOwn\(statuses, book\.status\)/);
  assert.match(source, /Math\.min\(safeTotalPages, Math\.floor\(currentPage\)\)/);
  assert.ok(source.includes('${safeCurrentPage}/${safeTotalPages}'));
  assert.match(source, /data-id="\$\{escapeHTML\(String\(book\.id\)\)\}"/);
  assert.doesNotMatch(source, /<h6 class="fw-bold mb-1">\$\{book\.title/);
});

test('travel photo sources and edit dialog fields are safe', () => {
  const source = read('js/modules/travels/travels.js');
  assert.match(source, /safeAvatarURL\(Array\.isArray\(travel\.photos\)/);
  assert.match(source, /escapeHTML\(photoURL\)/);
  assert.match(source, /escapeHTML\(String\(travel\?\.title \|\| ''\)\)/);
  assert.match(source, /escapeHTML\(String\(travel\?\.location \|\| ''\)\)/);
  assert.match(source, /escapeHTML\(String\(travel\?\.description \|\| ''\)\)/);
  assert.match(source, /escapeHTML\(String\(travel\?\.notes \|\| ''\)\)/);
  assert.match(source, /safeRating = Number\.isFinite\(rawRating\)/);
  assert.doesNotMatch(source, /<img src="\$\{escapeHTML\(travel\.photos\[0\]\)/);
});

test('collection deletion prevents repeated clicks and reports failed requests', () => {
  for (const name of ['books', 'travels', 'restaurants']) {
    const source = read('js/modules/' + name + '/' + name + '.js');
    assert.match(source, /if \(btn\.disabled \|\| !confirm\(/);
    assert.match(source, /btn\.disabled = true/);
    assert.match(source, /if \(!result\?\.success\) throw new Error/);
    assert.match(source, /Не удалось удалить запись\. Попробуй снова\./);
    assert.match(source, /finally \{\s*btn\.disabled = false/);
  }
});

test('movie save and delete handlers prevent duplicate writes and show failures', () => {
  const source = read('js/modules/movies/movies.js');
  assert.match(source, /if \(btn\.disabled \|\| !confirm\('Удалить фильм\?'\)\) return/);
  assert.match(source, /if \(!result\?\.success\) throw new Error\('Удаление не выполнено'\)/);
  assert.match(source, /Не удалось удалить фильм\. Попробуй снова\./);
  assert.match(source, /if \(saveButton\.disabled\) return/);
  assert.match(source, /saveButton\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(source, /saveButton\.removeAttribute\('aria-busy'\)/);
  assert.match(source, /Не удалось сохранить фильм\. Попробуй снова\./);
});

test('collection save forms show progress and remain retryable on failure', () => {
  for (const name of ['books', 'travels', 'restaurants']) {
    const source = read('js/modules/' + name + '/' + name + '.js');
    assert.match(source, /if \(saveButton\.disabled\) return/);
    assert.match(source, /saveButton\.disabled = true/);
    assert.match(source, /saveButton\.setAttribute\('aria-busy', 'true'\)/);
    assert.match(source, /saveButton\.removeAttribute\('aria-busy'\)/);
    assert.match(source, /finally \{\s*saveButton\.disabled = false/);
    assert.match(source, /Попробуй снова\./);
  }
});

test('collection pages ignore obsolete responses after filter or route changes', () => {
  for (const name of ['books', 'travels', 'restaurants']) {
    const source = read('js/modules/' + name + '/' + name + '.js');
    assert.match(source, /this\.requestId = 0/);
    assert.match(source, /const requestId = \+\+this\.requestId/);
    assert.match(source, /data-collection-request=/);
    assert.match(source, /requestId !== this\.requestId \|\| window\.app\.currentUser\?\.uid !== userId/);
    assert.match(source, /!mainContent\.isConnected/);
  }
});

test('movie searches and collections ignore superseded results', () => {
  const source = read('js/modules/movies/movies.js');
  const my = source.slice(source.indexOf('async loadMyMovies()'), source.indexOf('async loadPopularMovies()'));
  const search = source.slice(source.indexOf('async searchMovies()'), source.indexOf('createCard(movie'));
  assert.match(my, /const requestId = \+\+this\.requestId/);
  assert.match(my, /requestId !== this\.requestId \|\| this\.currentTab !== 'my'/);
  assert.match(search, /const requestId = \+\+this\.requestId/);
  assert.match(search, /requestId !== this\.requestId \|\| this\.currentTab !== 'search'/);
});

test('collection service loaders opt into propagating fetch errors without changing existing callers', () => {
  for (const name of ['book', 'travel', 'restaurant']) {
    const source = read('js/services/' + name + '.service.js');
    assert.match(source, /throwOnError = false/);
    assert.match(source, /if \(throwOnError\) throw error;/);
    assert.match(source, /return \[\];/);
  }
});

test('collection load failures show retry controls without rendering empty-state data', () => {
  for (const name of ['books', 'travels', 'restaurants']) {
    const source = read('js/modules/' + name + '/' + name + '.js');
    const section = source.slice(source.indexOf('async render()'), source.indexOf('\n    getTemplate('));
    assert.match(section, /throwOnError: true/);
    assert.match(section, /catch \(error\)/);
    assert.match(section, /role="alert"/);
    assert.match(section, /Повторить/);
    assert.match(section, /data-retry-/);
    assert.match(section, /addEventListener\('click', \(\) => this\.render\(\)\)/);
    assert.match(section, /requestId !== this\.requestId \|\| window\.app\.currentUser\?\.uid !== userId/g);
  }
});
