/**
 * Schedule alignment tests.
 *
 * The publish crons in .github/workflows/publish.yml have to fire shortly
 * after the scheduled tasks write an entry, in both halves of the year. That
 * relationship is easy to break, because the two schedules live in different
 * systems: the tasks are configured in claude.ai and the builds are in this
 * repository. Nothing else would catch a drift, and the symptom would be a
 * card that silently lags its notification for five months.
 *
 * Cron in GitHub Actions is always UTC and does not follow daylight saving, so
 * every Eastern time appears twice and each entry time is tested in both
 * seasons.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');

/** Every publish cron, as minutes past midnight UTC. */
const buildTimes = [...workflow.matchAll(/cron: '(\d+) (\d+) /g)]
  .map(([, minute, hour]) => Number(hour) * 60 + Number(minute))
  .sort((a, b) => a - b);

/**
 * When each edition is written, in UTC. Mirrors docs/scheduled-tasks.md.
 * The task fires on two crons and a guard in the prompt lets exactly one
 * through, which is what holds the Eastern time fixed across the year.
 */
const ENTRY_TIMES = [
  { edition: 'Opening Bell', season: 'summer', utc: 13 * 60 + 0, offset: 4 },
  { edition: 'Opening Bell', season: 'winter', utc: 14 * 60 + 0, offset: 5 },
  { edition: 'Closing Bell', season: 'summer', utc: 21 * 60 + 15, offset: 4 },
  { edition: 'Closing Bell', season: 'winter', utc: 22 * 60 + 15, offset: 5 },
];

/** The first build that runs after a given moment. */
const nextBuildAfter = (utcMinutes) => buildTimes.find((time) => time > utcMinutes);

test('the workflow lists ten publish crons', () => {
  // Four morning, two late morning catches, four evening.
  assert.equal(buildTimes.length, 10);
});

test('no entry can wait more than an hour for a build, in either season', () => {
  // A research run that overruns must not strand the card. The winter morning
  // used to fall through to the 4:30pm evening pass, a seven hour gap, because
  // the next cron after 14:20 UTC was 21:30.
  for (const { edition, season, utc } of ENTRY_TIMES) {
    const covering = buildTimes.filter((t) => t > utc && t <= utc + 120);
    assert.ok(
      covering.length >= 2,
      `${edition} in ${season} has only ${covering.length} build(s) in the two hours after it`
    );

    // And no gap larger than an hour inside that window.
    const points = [utc, ...covering];
    for (let i = 1; i < points.length; i += 1) {
      assert.ok(
        points[i] - points[i - 1] <= 60,
        `${edition} in ${season} has a ${points[i] - points[i - 1]} minute gap in build coverage`
      );
    }
  }
});

for (const { edition, season, utc, offset } of ENTRY_TIMES) {
  test(`${edition} in ${season} is followed by a build within 20 minutes`, () => {
    const build = nextBuildAfter(utc);
    assert.ok(build !== undefined, 'no build runs after this entry is written');

    const lag = build - utc;
    assert.ok(lag > 0, 'the build must run after the entry, not before');
    assert.ok(
      lag <= 20,
      `${lag} minutes between the entry and the build, which is too long a lag`
    );
  });
}

test('the morning card is live before the 9:30am opening bell, in both seasons', () => {
  // This is the one hard deadline. The Opening Bell edition is worthless if it
  // publishes after the market it was written to prepare for.
  for (const entry of ENTRY_TIMES.filter((e) => e.edition === 'Opening Bell')) {
    const build = nextBuildAfter(entry.utc);
    const easternMinutes = build - entry.offset * 60;
    assert.ok(
      easternMinutes < 9 * 60 + 30,
      `${entry.season}: build lands at ${Math.floor(easternMinutes / 60)}:${String(
        easternMinutes % 60
      ).padStart(2, '0')} Eastern, after the bell`
    );
  }
});

test('the evening card is never built before the close plus an hour', () => {
  // The journalism explaining a session publishes between 4:15 and 5:30pm, so
  // an entry written earlier than that would lack its sources.
  for (const entry of ENTRY_TIMES.filter((e) => e.edition === 'Closing Bell')) {
    const easternMinutes = entry.utc - entry.offset * 60;
    assert.ok(
      easternMinutes >= 17 * 60,
      `${entry.season}: entry written at ${Math.floor(easternMinutes / 60)}:${String(
        easternMinutes % 60
      ).padStart(2, '0')} Eastern, before the explainers publish`
    );
  }
});

test('both seasons deliver at the same Eastern time', () => {
  // The whole point of running each edition on two crons with a guard. If the
  // summer and winter entry times differ in Eastern, the guard design is wrong.
  for (const edition of ['Opening Bell', 'Closing Bell']) {
    const [summer, winter] = ENTRY_TIMES.filter((e) => e.edition === edition);
    assert.equal(
      summer.utc - summer.offset * 60,
      winter.utc - winter.offset * 60,
      `${edition} does not deliver at the same Eastern time year round`
    );
  }
});
