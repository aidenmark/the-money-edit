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
import {
  renderCard,
  renderArchive,
  renderGlossary,
  accentFor,
  entryPath,
  splitFigure,
  shortenLabel,
  renderLatestRedirect,
  renderManifest,
} from '../src/render.js';

/** Match how the renderer escapes text, so assertions compare like with like. */
const escapeForTest = (text) => String(text).replace(/&/g, '&amp;');

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/entries.json', import.meta.url)));
const entries = fixtures.entries
  .filter((entry) => entry.status === 'Published')
  .map((entry, index) => parseEntry({ ...entry, slug: `entry-${index}` }));

const withFigures = entries.find((entry) => entry.figures.length > 0);

test('a card with figures leads with the opening bell widget', () => {
  const html = renderCard(withFigures);

  assert.match(html, /class="widget widget--bell rise"/);
  assert.match(html, /class="bell-dot"/);
  // The bell must come before the story, since the numbers are the reason to
  // open this at 9:30 and the writing is what you stay for.
  assert.ok(html.indexOf('widget--bell') < html.indexOf('widget--story'));
});

test('only the first three figures get large tiles, the rest are still shown', () => {
  // The Aug 18 entry carries six figures. Three become headline tiles and the
  // other three drop to the quiet list. None may be dropped outright.
  assert.equal(withFigures.figures.length, 6);

  const html = renderCard(withFigures);
  assert.equal(html.match(/class="tape-tile"/g)?.length ?? 0, 3);
  assert.equal(html.match(/class="bell-row"/g)?.length ?? 0, 3);

  for (const figure of withFigures.figures) {
    assert.ok(html.includes(escapeForTest(figure.label)), `missing ${figure.label}`);
  }
});

test('a card with no figures omits the bell widget entirely', () => {
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

  assert.ok(!html.includes('widget--bell'), 'no bell widget without figures');
  assert.match(html, /widget--story/);
  assert.match(html, /Not much moved\./);
});

test('what it means for you is promoted out of the run of prose', () => {
  // This section is the reason the project exists, so it must not render as
  // just the third heading of three.
  const html = renderCard(withFigures);
  assert.match(html, /class="section section--payoff"/);
});

test('splitFigure does not split on a thousands separator', () => {
  // The original bug. "53,483 down 0.46%" split at the first comma and showed
  // a Dow of 53. The level has to swallow its own separators.
  assert.deepEqual(splitFigure({ value: '53,483 down 0.46%', direction: 'down', label: 'Dow' }), {
    level: '53,483',
    change: '0.46%',
  });
  assert.deepEqual(
    splitFigure({ value: '7,750.48 down 0.45%', direction: 'down', label: 'S&P 500' }),
    { level: '7,750.48', change: '0.45%' }
  );
});

test('splitFigure separates the level from the movement', () => {
  assert.deepEqual(splitFigure({ value: '0.5% to 7,703.78', label: 'S&P 500' }), {
    level: '7,703.78',
    change: '0.5%',
  });
  assert.deepEqual(splitFigure({ value: '5.30%, highest since 2007', label: 'x' }), {
    level: '5.30%',
    change: 'highest since 2007',
  });
  assert.deepEqual(splitFigure({ value: '4.72%', label: 'x' }), {
    level: '4.72%',
    change: '',
  });
});

test('long index names are shortened for the tiles but not lost', () => {
  assert.equal(shortenLabel('Dow Jones Industrial Average'), 'Dow');
  assert.equal(shortenLabel('30-year Treasury yield'), '30Y Treasury');
  assert.equal(shortenLabel('S&P 500'), 'S&P 500');

  // The untruncated name still has to reach the markup, as the tooltip.
  const html = renderCard(withFigures);
  assert.match(html, /title="Dow Jones Industrial Average"/);
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

test('entry paths are built from the date alone', () => {
  // The morning push notification has to construct this URL knowing only the
  // date. A slug would require knowing the headline before it is written.
  assert.equal(entryPath({ date: '2026-08-18', dateIndex: 0 }), '/2026/08/18/');
});

test('a second entry on the same day is suffixed, the first stays clean', () => {
  // Two entries already share 2026-08-14 in the database. The first must keep
  // the predictable path so the notification link stays correct.
  assert.equal(entryPath({ date: '2026-08-14', dateIndex: 0 }), '/2026/08/14/');
  assert.equal(entryPath({ date: '2026-08-14', dateIndex: 1 }), '/2026/08/14/2/');
});

test('the latest redirect points at the newest entry and is not indexed', () => {
  const html = renderLatestRedirect({
    date: '2026-08-18',
    dateIndex: 0,
    headline: 'Bond yields hit a 2007 high',
  });

  assert.match(html, /http-equiv="refresh" content="0; url=[^"]*\/2026\/08\/18\//);
  assert.match(html, /name="robots" content="noindex"/);
  // A plain link has to survive for anyone whose browser blocks the refresh.
  assert.match(html, /<a href="[^"]*\/2026\/08\/18\/">/);
});

test('the manifest opens on the latest entry in standalone mode', () => {
  const manifest = JSON.parse(renderManifest());

  assert.match(manifest.start_url, /\/latest\/$/);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#06070A');
  // Every icon the manifest names has to be a file the build actually writes.
  // The first version referenced assets/icon.svg, which was never generated.
  const written = new Set(['favicon.svg', 'icon.png']);
  for (const icon of manifest.icons) {
    assert.ok(
      written.has(icon.src.split('/').pop()),
      `manifest references ${icon.src}, which the build does not write`
    );
  }
});

test('the summary is not printed on the card when the body already contains it', () => {
  // The Content property is a condensation of the same writeup the page body
  // carries, so rendering both put the opening paragraph on screen twice on
  // every structured entry. The summary still has to reach the metadata.
  const html = renderCard(withFigures);
  const body = html.slice(html.indexOf('<body'));
  const head = html.slice(0, html.indexOf('<body'));

  assert.ok(!body.includes('card-lede'), 'the lede element should not render');
  assert.ok(
    !body.includes(withFigures.summary),
    'the summary should not appear in the visible card'
  );
  assert.ok(
    head.includes('og:description'),
    'the summary should still be carried in the page metadata'
  );
});
