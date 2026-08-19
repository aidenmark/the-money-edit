/**
 * Utility tests, weighted toward the date handling.
 *
 * The date bugs in this project have all been timezone bugs, so those cases
 * get the most attention. Each one below corresponds to a mistake that was
 * actually made rather than to a hypothetical.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  todayInNewYork,
  formatLongDate,
  formatShortDate,
  daysBetween,
  escapeHtml,
  slugify,
  stableHash,
} from '../src/util.js';

test('a plain date formats as the same calendar day it was written', () => {
  // The original bug. new Date('2026-08-18') is midnight UTC, which is
  // August 17 in New York, so a naive implementation prints the wrong day.
  assert.equal(formatLongDate('2026-08-18'), 'Tuesday, August 18, 2026');
  assert.equal(formatShortDate('2026-08-18'), 'Aug 18');
});

test('the first of a month does not roll back into the previous month', () => {
  assert.equal(formatLongDate('2026-01-01'), 'Thursday, January 1, 2026');
});

test('todayInNewYork returns a sortable YYYY-MM-DD string', () => {
  assert.match(todayInNewYork(), /^\d{4}-\d{2}-\d{2}$/);
});

test('todayInNewYork resolves late evening Eastern to the correct day', () => {
  // 10:36pm Eastern on August 18 is already August 19 in UTC. The entry still
  // belongs to August 18, which is what the newsroom timezone guarantees.
  const lateEvening = new Date('2026-08-19T02:36:00Z');
  assert.equal(todayInNewYork(lateEvening), '2026-08-18');
});

test('a malformed date returns an empty string rather than throwing', () => {
  assert.equal(formatLongDate(null), '');
  assert.equal(formatLongDate('not a date'), '');
});

test('daysBetween counts calendar days', () => {
  assert.equal(daysBetween('2026-07-19', '2026-08-18'), 30);
  assert.equal(daysBetween('2026-08-18', '2026-08-18'), 0);
});

test('escapeHtml neutralises the characters that appear in real entries', () => {
  assert.equal(escapeHtml('S&P 500 <b>'), 'S&amp;P 500 &lt;b&gt;');
});

test('slugify produces a readable url segment', () => {
  assert.equal(
    slugify('Bond yields hit a 2007 high, tech slides'),
    'bond-yields-hit-a-2007-high-tech-slides'
  );
  assert.equal(slugify('S&P 500 closes at a record high'), 's-and-p-500-closes-at-a-record-high');
});

test('stableHash is deterministic, which is what keeps old cards looking the same', () => {
  assert.equal(stableHash('2026-08-18'), stableHash('2026-08-18'));
  assert.notEqual(stableHash('2026-08-18'), stableHash('2026-08-17'));
});
