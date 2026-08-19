/**
 * Publishing policy tests.
 *
 * These cover the rules that decide what the public sees and at which URL.
 * They are the highest consequence logic in the project, because a mistake
 * here either leaks an unfinished entry or breaks the link in the morning
 * notification, and neither is obvious from looking at the built site.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  selectPublishable,
  byDateThenEdition,
  assignSlugs,
  collectGlossary,
} from '../src/build.js';
import { entryPath } from '../src/render.js';
import { EDITIONS, resolveEdition } from '../src/util.js';

const entry = (overrides) => ({
  id: 'id-1',
  headline: 'A headline',
  summary: 'A summary.',
  date: '2026-08-18',
  status: 'Published',
  edition: EDITIONS.closing,
  blocks: [],
  ...overrides,
});

test('only published entries reach the site', () => {
  const result = selectPublishable(
    [entry({ status: 'Published' }), entry({ id: 'id-2', status: 'Draft' })],
    '2026-08-18'
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'id-1');
});

test('an entry dated in the future is held back', () => {
  // This is what lets an entry be written ahead of time without appearing
  // early. Today is resolved in New York, never from the runner clock.
  const result = selectPublishable([entry({ date: '2026-08-19' })], '2026-08-18');
  assert.equal(result.length, 0);
});

test('an entry dated today is published', () => {
  assert.equal(selectPublishable([entry({ date: '2026-08-18' })], '2026-08-18').length, 1);
});

test('an entry with no date is never published', () => {
  assert.equal(selectPublishable([entry({ date: null })], '2026-08-18').length, 0);
});

test('ordering is total, so a rebuild cannot change the URLs', () => {
  // Two entries identical in every way the comparator looks at still have to
  // order the same way every time, or a rebuild would silently move a page.
  const a = entry({ id: 'aaa', date: '2026-08-14' });
  const b = entry({ id: 'bbb', date: '2026-08-14' });

  assert.deepEqual(
    [a, b].sort(byDateThenEdition).map((e) => e.id),
    [b, a].sort(byDateThenEdition).map((e) => e.id)
  );
});

test('newest entry sorts first', () => {
  const ordered = [
    entry({ id: 'old', date: '2026-08-14' }),
    entry({ id: 'new', date: '2026-08-18' }),
  ].sort(byDateThenEdition);
  assert.equal(ordered[0].id, 'new');
});

test('the glossary credits the day a term was first defined', () => {
  const later = entry({
    id: 'later',
    date: '2026-08-18',
    term: { term: 'Basis point', definition: 'A later rewording.' },
  });
  const earlier = entry({
    id: 'earlier',
    date: '2026-08-14',
    term: { term: 'basis point', definition: 'One hundredth of a percentage point.' },
  });

  const glossary = collectGlossary([later, earlier]);

  // One entry, matched case insensitively, crediting the earlier date.
  assert.equal(glossary.length, 1);
  assert.equal(glossary[0].entry.date, '2026-08-14');
  assert.equal(glossary[0].definition, 'One hundredth of a percentage point.');
});
