/**
 * Renderer tests.
 *
 * These check structure rather than styling. The things worth pinning are the
 * ones that would silently regress: source order, which drives the reading
 * order on a phone, and the layout modifier that keeps a card without figures
 * from leaving an empty column.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseEntry } from '../src/parse.js';
import { renderCard, renderArchive, renderGlossary, accentFor, entryPath } from '../src/render.js';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/entries.json', import.meta.url)));
const entries = fixtures.entries
  .filter((entry) => entry.status === 'Published')
  .map((entry, index) => parseEntry({ ...entry, slug: `entry-${index}` }));

const withFigures = entries.find((entry) => entry.figures.length > 0);

test('a card with figures renders the rail', () => {
  const html = renderCard(withFigures);

  assert.match(html, /class="card"/);
  assert.match(html, /class="card-rail rise"/);
  assert.ok(!html.includes('card--no-rail'), 'should not carry the no-rail modifier');
});

test('the rail comes before the prose in the source', () => {
  // This is what puts key figures directly under the lede on a phone, where
  // the grid collapses to document order. Reversing it would strand the
  // numbers at the bottom of the page.
  const html = renderCard(withFigures);

  assert.ok(
    html.indexOf('class="card-rail') < html.indexOf('class="card-main"'),
    'the rail must precede card-main so the mobile reading order is correct'
  );
});

test('a card with no figures drops the rail and widens the prose', () => {
  const bare = parseEntry({
    id: 'x',
    headline: 'A quiet day',
    summary: 'Not much moved.',
    date: '2026-08-20',
    status: 'Published',
    slug: 'a-quiet-day',
    blocks: [],
  });

  const html = renderCard(bare);

  assert.match(html, /class="card card--no-rail"/);
  assert.ok(!html.includes('card-rail'), 'there should be no rail element at all');
  // The summary still has to appear, even with an empty page body.
  assert.match(html, /Not much moved\./);
});

test('previous and next hold their grid columns when one side is missing', () => {
  const html = renderCard(withFigures, { previous: null, next: entries[1] ?? null });

  if (entries[1]) {
    // An empty span keeps next hard right on the oldest entry.
    assert.match(html, /<nav class="card-nav[^"]*"[^>]*>\s*<span><\/span>/);
  }
});

test('every page escapes the ampersand in an index name', () => {
  const pages = [
    renderCard(withFigures),
    renderArchive(entries),
    renderGlossary(
      entries.filter((e) => e.term).map((e) => ({ ...e.term, entry: e })),
      { latestDate: entries[0].date }
    ),
  ];

  for (const html of pages) {
    const body = html.slice(html.indexOf('<body'));
    assert.ok(
      !/&(?!amp;|lt;|gt;|quot;|#39;|rarr;)/.test(body),
      'found an unescaped ampersand in rendered output'
    );
  }
});

test('the archive shows its empty state rather than a broken page', () => {
  const html = renderArchive([]);

  assert.match(html, /Nothing published yet/);
  assert.ok(!html.includes('archive-list'), 'no list should render with no entries');
});

test('the glossary shows its empty state before any term exists', () => {
  assert.match(renderGlossary([]), /glossary is still filling up/);
});

test('the accent is stable for a date and differs between dates', () => {
  assert.deepEqual(accentFor('2026-08-18'), accentFor('2026-08-18'));
  assert.notEqual(accentFor('2026-08-18').className, accentFor('2026-08-17').className);
  assert.match(accentFor('2026-08-18').className, /^accent-[0-7]$/);
});

test('entry paths are date first so they sort chronologically', () => {
  assert.equal(
    entryPath({ date: '2026-08-18', slug: 'bond-yields' }),
    '/entries/2026-08-18-bond-yields/'
  );
});
