/**
 * Schedule coverage tests.
 *
 * The publish crons in .github/workflows/publish.yml have to produce a build
 * shortly after the scheduled tasks in claude.ai write an entry. That
 * relationship is easy to break, because the two halves live in different
 * systems and nothing else would catch a drift. The symptom would be a card
 * that silently lags its notification, possibly for five months.
 *
 * These tests used to assert that a named cron sat within twenty minutes of a
 * named entry time. Three days of live operation showed why that was the wrong
 * property. Every run started 29 to 44 minutes behind its cron in the morning,
 * and two crons ten minutes apart started seven minutes apart, so the delay is
 * a queue that swallows the whole window rather than jitter on each run. A
 * cron cannot be aimed. The old tests passed the entire time the site was
 * lagging by half an hour, which is the clearest possible sign they were
 * measuring the wrong thing.
 *
 * What survives a uniform delay is spacing. So these tests assert coverage
 * instead of punctuality: builds are scheduled closely enough together, across
 * a window wide enough to hold both daylight saving offsets, that an entry
 * appearing anywhere in it is picked up promptly no matter how far behind the
 * queue is running.
 *
 * There is a second limit these tests now also pin, learned the expensive way.
 * Coverage cannot simply be bought by scheduling more. This workflow briefly
 * asked for 48 builds a weekday with a ten minute step, and GitHub delivered 1
 * to 3 of them at delays up to four hours, where ten discrete crons had been
 * delivering 10 to 13 reliably. Requesting more produced far less. So the cron
 * count is capped here, and spacing has to fit inside that budget.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');

/**
 * Expand a cron minute and hour field into every minute past midnight UTC it
 * fires at. Only the syntax this workflow actually uses is supported, which is
 * a step over a range and a plain number. Anything else throws rather than
 * being silently skipped, because a cron this file cannot read is a cron these
 * tests are not checking.
 */
function expandField(field, max) {
  if (/^\d+$/.test(field)) return [Number(field)];

  const step = field.match(/^\*\/(\d+)$/);
  if (step) {
    const size = Number(step[1]);
    return Array.from({ length: Math.ceil((max + 1) / size) }, (_, i) => i * size);
  }

  const range = field.match(/^(\d+)-(\d+)$/);
  if (range) {
    const [, from, to] = range.map(Number);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }

  throw new Error(`unsupported cron field "${field}"`);
}

/** Every minute past midnight UTC at which a build is scheduled. */
const buildTimes = [
  ...new Set(
    [...workflow.matchAll(/cron: '(\S+) (\S+) /g)].flatMap(([, minuteField, hourField]) =>
      expandField(hourField, 23).flatMap((hour) =>
        expandField(minuteField, 59).map((minute) => hour * 60 + minute)
      )
    )
  ),
].sort((a, b) => a - b);

/**
 * When an entry can appear, in UTC.
 *
 * These are ranges rather than points, which is the other thing three days of
 * operation taught. The claude.ai scheduler is not punctual either, the 9:00am
 * task has started as late as 9:22 and been skipped entirely twice, and when it
 * is skipped the 10:00am backup writes instead. So the earliest an entry can
 * land is a fast manual run and the latest is the backup task finishing.
 *
 * Eastern times are converted at both offsets, because a window that only
 * holds one season is the twice yearly bug this file exists to prevent.
 */
const EASTERN_WINDOWS = [
  { edition: 'Opening Bell', fromEastern: 9 * 60 + 5, toEastern: 10 * 60 + 25 },
  { edition: 'Closing Bell', fromEastern: 17 * 60 + 16, toEastern: 18 * 60 + 40 },
];

const OFFSETS = [
  { season: 'summer', hours: 4 },
  { season: 'winter', hours: 5 },
];

/** Every entry window in UTC, both editions in both seasons. */
const ENTRY_WINDOWS = EASTERN_WINDOWS.flatMap(({ edition, fromEastern, toEastern }) =>
  OFFSETS.map(({ season, hours }) => ({
    edition,
    season,
    from: fromEastern + hours * 60,
    to: toEastern + hours * 60,
  }))
);

/** The worst cron delay seen in production, used as the safety margin. */
const OBSERVED_MAX_LAG = 45;

/**
 * How long an entry may wait for the next build, ignoring queue delay.
 *
 * Thirty five rather than ten, because ten cost more crons than GitHub would
 * actually run. This is the tightest spacing that fits under MAX_CRONS while
 * still covering both editions in both seasons.
 */
const MAX_SPACING = 35;

/**
 * The most crons this workflow may ask for.
 *
 * Above roughly a dozen, GitHub throttles the schedule and delivers almost
 * nothing. Ten crons produced 10 to 13 runs a day; 48 produced 1 to 3. This cap
 * is the empirical ceiling, not a style preference, and raising it has been
 * tried and made the site a day stale.
 */
const MAX_CRONS = 14;

test('every entry window is covered without a gap larger than the spacing budget', () => {
  // This is the property that actually holds under a delayed queue. If builds
  // are scheduled every ten minutes then they execute every ten minutes, so an
  // entry landing anywhere in the window waits at most ten minutes plus
  // whatever constant the queue is adding to everything.
  for (const { edition, season, from, to } of ENTRY_WINDOWS) {
    const inWindow = buildTimes.filter((t) => t >= from && t <= to + MAX_SPACING);

    assert.ok(
      inWindow.length > 0,
      `${edition} in ${season} has no builds scheduled in its entry window`
    );

    const points = [from, ...inWindow];
    for (let i = 1; i < points.length; i += 1) {
      const gap = points[i] - points[i - 1];
      assert.ok(
        gap <= MAX_SPACING,
        `${edition} in ${season} has a ${gap} minute gap in build coverage`
      );
    }

    const last = points[points.length - 1];
    assert.ok(
      last >= to,
      `${edition} in ${season} stops being covered at ${last}, before its window ends at ${to}`
    );
  }
});

test('coverage begins early enough to absorb the worst observed delay', () => {
  // A window that starts exactly when entries can start would, at a 44 minute
  // queue delay, produce its first execution 44 minutes after the first
  // possible entry. Starting an hour early means execution is already underway.
  for (const { edition, season, from } of ENTRY_WINDOWS) {
    const first = buildTimes.find((t) => t >= from - 120);
    assert.ok(first !== undefined, `${edition} in ${season} has no build scheduled before it`);
    assert.ok(
      first <= from - OBSERVED_MAX_LAG,
      `${edition} in ${season} starts building at ${first}, only ${
        from - first
      } minutes before an entry can appear, which is less than the ${OBSERVED_MAX_LAG} minute worst case delay`
    );
  }
});

test('the schedule stays under the count GitHub will actually run', () => {
  // The regression this guards against did not fail loudly. Every test passed,
  // the workflow stayed active, and the runs simply did not happen.
  const crons = [...workflow.matchAll(/cron: '([^']+)'/g)].map(([, cron]) => cron);
  assert.ok(
    crons.length <= MAX_CRONS,
    `${crons.length} crons requested, above the ${MAX_CRONS} that GitHub reliably delivers`
  );
});

test('both seasons are covered without a season specific schedule', () => {
  // The windows are wide enough that summer and winter fall inside the same
  // span, so nothing has to be changed twice a year.
  for (const { edition, from, to } of ENTRY_WINDOWS) {
    assert.ok(
      buildTimes.some((t) => t >= from && t <= to + MAX_SPACING),
      `${edition} falls outside every cron expression in one of the two seasons`
    );
  }
});

test('the build load stays under the Pages limit of ten deploys an hour', () => {
  // Polling is only acceptable while it stays polite. Six an hour leaves room.
  for (let hour = 0; hour < 24; hour += 1) {
    const inHour = buildTimes.filter((t) => Math.floor(t / 60) === hour).length;
    assert.ok(inHour <= 6, `${inHour} builds scheduled in the ${hour}:00 UTC hour`);
  }
});

test('both editions deliver at the same Eastern time year round', () => {
  // The whole reason the tasks run on two firings with a guard. This is about
  // the upstream schedule rather than the build, but if it ever stops being
  // true the windows above are aimed at the wrong hours.
  for (const { edition, fromEastern, toEastern } of EASTERN_WINDOWS) {
    const windows = ENTRY_WINDOWS.filter((w) => w.edition === edition);
    for (const { season, from, to, } of windows) {
      const offset = OFFSETS.find((o) => o.season === season).hours * 60;
      assert.equal(from - offset, fromEastern, `${edition} in ${season} starts at a different Eastern time`);
      assert.equal(to - offset, toEastern, `${edition} in ${season} ends at a different Eastern time`);
    }
  }
});

test('no build is scheduled during the trading day it has nothing to say about', () => {
  // Between the two windows there is nothing new to publish, so a build there
  // would be pure noise. This is what keeps the polling bounded rather than
  // creeping outward every time something is late.
  const quiet = buildTimes.filter((t) => t > 16 * 60 && t < 20 * 60);
  assert.equal(quiet.length, 0, `${quiet.length} builds scheduled in the quiet afternoon hours`);
});
