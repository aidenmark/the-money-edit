/**
 * Parser tests.
 *
 * The fixtures are real entries from the database, not invented ones, because
 * the whole reason this parser exists is that the live data comes in three
 * different shapes. Testing against made up input would prove nothing about
 * the case that actually matters.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseEntry, parseFigure, parseTerm } from '../src/parse.js';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/entries.json', import.meta.url)));
const byHeadline = (needle) =>
  fixtures.entries.find((entry) => entry.headline.includes(needle));

test('structured entry yields named sections in a fixed order', () => {
  const parsed = parseEntry(byHeadline('Bond yields'));

  assert.equal(parsed.bodyFormat, 'structured');
  assert.deepEqual(
    parsed.sections.map((section) => section.key),
    ['what-happened', 'why-it-happened', 'what-it-means']
  );
  assert.match(parsed.sections[0].html, /^<p>The 30-year Treasury yield/);
});

test('structured entry reads key figures out of the bullet list', () => {
  const parsed = parseEntry(byHeadline('Bond yields'));

  assert.equal(parsed.figures.length, 6);
  assert.deepEqual(parsed.figures[0], {
    label: 'S&P 500',
    // The leading "down" is dropped because the tile renders an arrow.
    value: '0.5% to 7,703.78',
    direction: 'down',
  });
  // A figure with no movement word should not be tinted.
  const tenYear = parsed.figures.find((figure) => figure.label === '10-year Treasury yield');
  assert.equal(tenYear.direction, 'flat');
});

test('structured entry captures the named term and the source link', () => {
  const parsed = parseEntry(byHeadline('Bond yields'));

  assert.equal(parsed.term.term, 'Treasury yield');
  assert.match(parsed.term.definition, /^A Treasury yield is what the US government pays/);
  assert.equal(parsed.sources.length, 1);
  assert.equal(
    parsed.sources[0].url,
    'https://finance.yahoo.com/markets/stocks/articles/nvidia-amd-broadcom-meta-slide-154244427.html'
  );
  assert.equal(parsed.sources[0].title, 'Nvidia, AMD, Broadcom, Meta Slide as Bond Yields Surge');
});

test('loose entry still produces prose, figures, a term, and a source', () => {
  const parsed = parseEntry(byHeadline('Oil climbs'));

  assert.equal(parsed.bodyFormat, 'loose');
  // With no headings, all prose belongs under what happened.
  assert.deepEqual(parsed.sections.map((s) => s.key), ['what-happened']);
  assert.equal(parsed.figures.length, 5);
  assert.deepEqual(parsed.figures[0], {
    label: 'Dow',
    value: '53,483 down 0.46%',
    direction: 'down',
  });
  assert.equal(parsed.term.term, 'basis point');
  assert.equal(parsed.sources[0].title, 'STL.News, Stock Market Trading Summary, Monday, August 17, 2026');
});

test('loose entry moves a trailing qualifier off the label', () => {
  const parsed = parseEntry(byHeadline('Oil climbs'));
  const thirtyYear = parsed.figures.find((f) => f.label === '30-year Treasury');

  // "30-year Treasury above 5.3%" must not label the tile "Treasury above".
  assert.ok(thirtyYear, 'expected a 30-year Treasury figure');
  assert.equal(thirtyYear.value, 'above 5.3%');
});

test('empty entry falls back to the Content property rather than rendering blank', () => {
  const parsed = parseEntry(byHeadline('record high'));

  assert.equal(parsed.bodyFormat, 'empty');
  assert.equal(parsed.figures.length, 0);
  assert.equal(parsed.term, null);
  assert.equal(parsed.sections.length, 1);
  assert.match(parsed.sections[0].html, /closed at a record high/);
});

test('an ampersand in the source text is escaped, not passed through raw', () => {
  const parsed = parseEntry(byHeadline('Retail sales'));
  const html = parsed.sections.map((s) => s.html).join('');

  assert.ok(!/&(?!amp;|lt;|gt;|quot;|#39;)/.test(html), 'found an unescaped ampersand');
});

test('parseFigure splits on a colon when one is present', () => {
  assert.deepEqual(parseFigure('Nasdaq 100: down 1.7% to 29,475'), {
    label: 'Nasdaq 100',
    value: '1.7% to 29,475',
    direction: 'down',
  });
});

test('parseFigure finds the value boundary when there is no colon', () => {
  // "S&P 500" contains a number, so a naive first-digit split would be wrong.
  assert.deepEqual(parseFigure('S&P 500 7,750.48 down 0.45%'), {
    label: 'S&P 500',
    value: '7,750.48 down 0.45%',
    direction: 'down',
  });
});

test('parseFigure recognises an upward move', () => {
  assert.equal(parseFigure('WTI crude: $85.67 a barrel, up 1.4%').direction, 'up');
});

test('only a leading direction word is dropped, not one mid sentence', () => {
  // The arrow replaces a leading word. Wording later in the value is part of
  // the sentence and has to survive.
  assert.equal(parseFigure('WTI crude: $85.67 a barrel, up 1.4%').value, '$85.67 a barrel, up 1.4%');
  assert.equal(parseFigure('S&P 500: down 0.5% to 7,703.78').value, '0.5% to 7,703.78');
});

test('parseTerm handles the explicit naming form', () => {
  const result = parseTerm('Term of the day: basis point. One hundredth of a percentage point.');
  assert.equal(result.term, 'basis point');
  assert.equal(result.definition, 'One hundredth of a percentage point.');
});

test('parseTerm infers the term when only a definition is given', () => {
  const result = parseTerm('Term of the day. A basis point is one hundredth of a percentage point.');
  assert.equal(result.term, 'basis point');
});

test('a direction word stuck to the label moves onto the value', () => {
  // "S&P 500 down 0.29%" used to label the tile "S&P 500 down" with a value
  // of "0.29%". The direction never reached the value, so the tile showed no
  // arrow and no tint and the reader lost the fact that it fell.
  assert.deepEqual(parseFigure('S&P 500 down 0.29%'), {
    label: 'S&P 500',
    value: '0.29%',
    direction: 'down',
  });

  assert.deepEqual(parseFigure('Broadcom down 6%'), {
    label: 'Broadcom',
    value: '6%',
    direction: 'down',
  });

  assert.deepEqual(parseFigure('Gold up 1.2%'), {
    label: 'Gold',
    value: '1.2%',
    direction: 'up',
  });
});

test('a label that legitimately ends in a qualifier still keeps its value', () => {
  const figure = parseFigure('10-year Treasury about 4.72%');
  assert.equal(figure.label, '10-year Treasury');
  assert.equal(figure.value, 'about 4.72%');
  assert.equal(figure.direction, 'flat');
});

test('an entry built from several articles credits every one of them', () => {
  // Entries routinely draw on more than one piece of reporting. The earlier
  // version kept a single source and let each new one overwrite the last,
  // which silently dropped attribution.
  const parsed = parseEntry({
    id: 'multi',
    headline: 'Two sources',
    summary: 'Summary.',
    date: '2026-08-20',
    blocks: [
      { type: 'heading_2', heading_2: { rich_text: [{ plain_text: 'Source' }] } },
      {
        type: 'paragraph',
        paragraph: { rich_text: [{ plain_text: 'First report', href: 'https://a.example/1' }] },
      },
      {
        type: 'paragraph',
        paragraph: { rich_text: [{ plain_text: 'Second report', href: 'https://b.example/2' }] },
      },
    ],
  });

  assert.equal(parsed.sources.length, 2);
  assert.deepEqual(parsed.sources.map((s) => s.url), ['https://a.example/1', 'https://b.example/2']);
});

test('the same article listed twice is credited once', () => {
  const parsed = parseEntry({
    id: 'dupe',
    headline: 'One source twice',
    summary: 'Summary.',
    date: '2026-08-20',
    blocks: [
      { type: 'heading_2', heading_2: { rich_text: [{ plain_text: 'Source' }] } },
      {
        type: 'paragraph',
        paragraph: { rich_text: [{ plain_text: 'A report', href: 'https://a.example/1' }] },
      },
      {
        type: 'paragraph',
        paragraph: { rich_text: [{ plain_text: 'A report again', href: 'https://a.example/1' }] },
      },
    ],
  });

  assert.equal(parsed.sources.length, 1);
});

test('an entry with no page body credits nothing rather than inventing a source', () => {
  const parsed = parseEntry({
    id: 'bare',
    headline: 'Bare',
    summary: 'Summary.',
    date: '2026-08-20',
    blocks: [],
  });
  assert.deepEqual(parsed.sources, []);
});
