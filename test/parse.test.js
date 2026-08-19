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
    value: 'down 0.5% to 7,703.78',
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
  assert.equal(
    parsed.source.url,
    'https://finance.yahoo.com/markets/stocks/articles/nvidia-amd-broadcom-meta-slide-154244427.html'
  );
  assert.equal(parsed.source.title, 'Nvidia, AMD, Broadcom, Meta Slide as Bond Yields Surge');
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
  assert.equal(parsed.source.title, 'STL.News, Stock Market Trading Summary, Monday, August 17, 2026');
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
    value: 'down 1.7% to 29,475',
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

test('parseTerm handles the explicit naming form', () => {
  const result = parseTerm('Term of the day: basis point. One hundredth of a percentage point.');
  assert.equal(result.term, 'basis point');
  assert.equal(result.definition, 'One hundredth of a percentage point.');
});

test('parseTerm infers the term when only a definition is given', () => {
  const result = parseTerm('Term of the day. A basis point is one hundredth of a percentage point.');
  assert.equal(result.term, 'basis point');
});
