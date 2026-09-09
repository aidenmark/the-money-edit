/**
 * Rebuild trigger tests.
 *
 * The Worker's only real logic is deciding whether an edition is due right now,
 * and that decision is made from a wall clock in America/New_York. Every date
 * bug this project has had was a timezone bug, so the interesting cases here
 * are all seasonal: the same UTC instant means different things in June and
 * December, and the cron deliberately fires at both.
 *
 * The network parts are not tested here. They are three lines each and testing
 * them would mean testing fetch.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { dueEdition, entryUrl, easternNow, WATCH_WINDOWS } from '../worker/src/index.js';

const at = (iso) => new Date(iso);

test('an Eastern wall clock is read correctly in both seasons', () => {
  // 13:20 UTC is 9:20am in summer and 8:20am in winter. Reading the offset
  // from the runner clock instead of the zone is how this breaks.
  assert.deepEqual(easternNow(at('2026-09-09T13:20:00Z')), {
    date: '2026-09-09',
    minutes: 9 * 60 + 20,
  });
  assert.deepEqual(easternNow(at('2026-12-09T13:20:00Z')), {
    date: '2026-12-09',
    minutes: 8 * 60 + 20,
  });
});

test('the date is resolved in New York, not UTC', () => {
  // 01:30 UTC is still the previous evening in New York. A build triggered here
  // must look for yesterday's closing bell, not a page that does not exist yet.
  assert.equal(easternNow(at('2026-09-10T01:30:00Z')).date, '2026-09-09');
});

test('the morning edition is due through the whole summer window', () => {
  assert.equal(dueEdition(at('2026-09-09T13:20:00Z')), 'opening'); // 9:20am ET
  assert.equal(dueEdition(at('2026-09-09T14:30:00Z')), 'opening'); // 10:30am ET
});

test('the morning edition is due through the whole winter window', () => {
  assert.equal(dueEdition(at('2026-12-09T14:20:00Z')), 'opening'); // 9:20am ET
  assert.equal(dueEdition(at('2026-12-09T15:30:00Z')), 'opening'); // 10:30am ET
});

test('the evening edition is due in both seasons', () => {
  assert.equal(dueEdition(at('2026-09-09T21:30:00Z')), 'closing'); // 5:30pm ET
  assert.equal(dueEdition(at('2026-12-09T22:30:00Z')), 'closing'); // 5:30pm ET
});

test('firings that land outside the Eastern window do nothing', () => {
  // These are the off season halves of the cron span, and they are supposed to
  // be no ops rather than errors. Half of every day's firings look like this.
  assert.equal(dueEdition(at('2026-12-09T13:10:00Z')), null); // 8:10am ET, too early
  assert.equal(dueEdition(at('2026-09-09T15:40:00Z')), null); // 11:40am ET, too late
  assert.equal(dueEdition(at('2026-12-09T21:10:00Z')), null); // 4:10pm ET, too early
  assert.equal(dueEdition(at('2026-09-09T23:40:00Z')), null); // 7:40pm ET, too late
});

test('nothing is due before the task has had time to write', () => {
  // The task fires at 9:00 and 5:15 Eastern. Checking at the same instant would
  // guarantee a 404 and burn a build on every single day.
  assert.equal(dueEdition(at('2026-09-09T13:02:00Z')), null); // 9:02am ET
  assert.equal(dueEdition(at('2026-09-09T21:17:00Z')), null); // 5:17pm ET
});

test('the checked URL matches the path the build actually writes', () => {
  // entryPath in src/render.js builds /YYYY/MM/DD/edition/. If these ever
  // disagree the Worker checks a page that can never exist and fires forever.
  const url = entryUrl(at('2026-09-09T13:20:00Z'));
  assert.ok(
    url.startsWith('https://aidenmark.github.io/the-money-edit/2026/09/09/opening/'),
    `unexpected URL: ${url}`
  );
});

test('the checked URL carries a cache buster', () => {
  // GitHub Pages sends max-age=600. Without this the Worker can read a stale
  // 404 and dispatch a rebuild for an entry that is already published.
  assert.match(entryUrl(at('2026-09-09T13:20:00Z')), /[?&]trigger=\d+/);
});

test('no URL is built when nothing is due', () => {
  assert.equal(entryUrl(at('2026-09-09T18:00:00Z')), null);
});

test('the cron span covers every watch window in both seasons', () => {
  // The Worker can only act on a tick it actually receives. If the cron span
  // and the watch windows drift apart, the Worker is correct and still never
  // runs, which is a silent failure of exactly the kind this project keeps
  // producing. This asserts they still line up.
  const toml = readFileSync(new URL('../worker/wrangler.toml', import.meta.url), 'utf8');
  const cron = toml.match(/crons\s*=\s*\[\s*"([^"]+)"/)?.[1];
  assert.ok(cron, 'no cron trigger found in wrangler.toml');

  const [minuteField, hourField] = cron.split(' ');
  const step = Number(minuteField.match(/^\*\/(\d+)$/)?.[1]);
  assert.ok(step && step <= 15, `minute step ${minuteField} is too coarse`);

  const hours = hourField.split(',').flatMap((part) => {
    const [from, to] = part.split('-').map(Number);
    return Array.from({ length: (to ?? from) - from + 1 }, (_, i) => from + i);
  });

  for (const { edition, from, to } of WATCH_WINDOWS) {
    for (const offset of [4, 5]) {
      // Every minute of the window, converted to UTC, must fall in a cron hour.
      const covered = (m) => hours.includes(Math.floor(((m + offset * 60) % 1440) / 60));
      assert.ok(
        covered(from) && covered(to - 1),
        `${edition} at UTC-${offset} is not covered by cron hours ${hourField}`
      );
    }
  }
});

test('the two watch windows do not overlap', () => {
  // Overlapping windows would make dueEdition depend on array order rather than
  // on the clock, which is the sort of thing that works until it does not.
  const [morning, evening] = WATCH_WINDOWS;
  assert.ok(morning.to <= evening.from, 'watch windows overlap');
});
