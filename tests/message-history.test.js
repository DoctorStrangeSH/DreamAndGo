import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageHistory } from '../js/core/message-history.js';

const message = (id, minute, text = id) => ({
    id, text, createdAt: new Date(2026, 0, 1, 0, minute)
});

test('live and paged messages merge without duplicates in chronological order', () => {
    const history = new MessageHistory();
    history.merge([message('latest', 3), message('middle', 2)]);
    history.merge([message('oldest', 1), message('middle', 2)]);
    assert.deepEqual(history.ordered().map(m => m.id), ['oldest', 'middle', 'latest']);
    assert.equal(history.size, 3);
});

test('newer realtime snapshot updates a previously cached message', () => {
    const history = new MessageHistory();
    history.merge([message('a', 1, 'old')]);
    history.merge([{ ...message('a', 1, 'updated'), edited: true }]);
    assert.equal(history.size, 1);
    assert.equal(history.ordered()[0].text, 'updated');
    assert.equal(history.ordered()[0].edited, true);
});

test('editing and deleting a paged message updates the history view', () => {
    const history = new MessageHistory();
    history.merge([message('old', 1), message('new', 2)]);
    assert.equal(history.change('old', { text: 'edited', edited: true }), true);
    assert.equal(history.ordered()[0].text, 'edited');
    assert.equal(history.change('old', null), true);
    assert.deepEqual(history.ordered().map(m => m.id), ['new']);
    assert.equal(history.change('missing', null), false);
});

test('messages with matching timestamps use stable ids to break ties', () => {
    const history = new MessageHistory();
    history.merge([message('b', 1), message('a', 1)]);
    assert.deepEqual(history.ordered().map(m => m.id), ['a', 'b']);
});
