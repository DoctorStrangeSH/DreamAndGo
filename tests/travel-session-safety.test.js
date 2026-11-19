import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/modules/travels/travels.js', import.meta.url), 'utf8');
const modalStart = source.indexOf('    async showModal(travelId) {');
const modalEnd = source.indexOf('\n    pluralize(', modalStart);
assert.ok(modalStart >= 0 && modalEnd > modalStart, 'TravelsModule.showModal must exist');
const modal = source.slice(modalStart, modalEnd);

test('travel editor ignores a delayed record load after account switch or newer modal', () => {
    assert.match(source, /this\.modalRequestId = 0/);
    assert.match(modal, /const modalRequestId = \+\+this\.modalRequestId/);
    assert.match(modal, /const userId = window\.app\.currentUser\?\.uid/);
    assert.match(modal, /await this\.travelService\.getTravel\(userId, travelId\)/);
    assert.match(modal, /if \(modalRequestId !== this\.modalRequestId \|\| window\.app\.currentUser\?\.uid !== userId\) return/);
});

test('travel save stays scoped to the starting account and does not refresh a new session', () => {
    assert.match(modal, /if \(window\.app\.currentUser\?\.uid !== userId\) \{\s*modal\.hide\(\);\s*return;\s*\}/);
    assert.match(modal, /await this\.travelService\.(?:updateTravel|addTravel)\(userId/);
    assert.match(modal, /\/\/ The write remains scoped to the original UID; never update a new session's UI\./);
    assert.match(modal, /if \(window\.app\.currentUser\?\.uid === userId\) await this\.render\(\)/);
    assert.match(modal, /if \(window\.app\.currentUser\?\.uid === userId\) \{\s*window\.app\.ui\.showToast/);
    assert.match(modal, /if \(saveButton\.isConnected\) \{\s*saveButton\.disabled = false/);
});

test('travel deletion uses the initiating account and suppresses stale-session UI updates', () => {
    const handlerStart = source.indexOf("document.querySelectorAll('.delete-btn').forEach");
    const handlerEnd = source.indexOf("document.querySelectorAll('#statusFilters", handlerStart);
    assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'travel delete handler must exist');
    const handler = source.slice(handlerStart, handlerEnd);
    assert.match(handler, /const userId = window\.app\.currentUser\?\.uid/);
    assert.match(handler, /if \(!userId \|\| btn\.disabled \|\| !confirm\(/);
    assert.match(handler, /await this\.travelService\.deleteTravel\(userId, btn\.dataset\.id\)/);
    assert.match(handler, /if \(window\.app\.currentUser\?\.uid !== userId\) return/);
    assert.match(handler, /if \(window\.app\.currentUser\?\.uid === userId\) window\.app\.refreshUserData\(\)/);
    assert.match(handler, /if \(window\.app\.currentUser\?\.uid === userId\) \{\s*window\.app\.ui\.showToast/);
    assert.match(handler, /finally \{\s*btn\.disabled = false/);
});
