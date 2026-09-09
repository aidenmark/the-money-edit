/**
 * The rebuild trigger.
 *
 * This is the alarm clock for the site build, and it exists because GitHub's
 * is broken for this use case.
 *
 * GitHub Actions handles every event type immediately except `schedule`, which
 * it deprioritizes under load. Measured over three weeks on this repository, a
 * `repository_dispatch` produced a run in the same second it was sent, while
 * scheduled crons ran 29 to 44 minutes late in August, degrading to 1 to 3.5
 * hours by September, and on 2026-09-09 the entire morning window produced no
 * run at all. Both a denser schedule and a sparser one were tried and measured;
 * neither helps, because the delay is on GitHub's side and has no setting.
 *
 * So the schedule moves to Cloudflare, whose Cron Triggers fire on time, and
 * everything else stays exactly where it was. The repository, the build and the
 * site are all still on GitHub. This Worker only decides when to knock.
 *
 * It knocks conditionally rather than on every tick. Firing on all 36 ticks a
 * weekday would mean 36 deploys a day, which is both wasteful and close to the
 * rate GitHub Pages is willing to accept. Instead it asks the live site whether
 * today's edition is already there, and stays quiet once it is. In the normal
 * case that means one or two dispatches per edition.
 *
 * It deliberately knows nothing about Notion. Checking the published site
 * answers the question that actually matters, "is the site current," and keeps
 * the Notion token out of a second platform.
 */

const REPO = 'aidenmark/the-money-edit';
const SITE = 'https://aidenmark.github.io/the-money-edit';
const TIMEZONE = 'America/New_York';

/**
 * When each edition should be visible on the site, in minutes past midnight
 * Eastern.
 *
 * These start slightly after the scheduled task writes, because a check that
 * begins before the entry can possibly exist just burns a build. The task fires
 * at 9:00am and 5:15pm, and takes roughly five to twenty five minutes.
 *
 * They end well after the latest observed write, so a slow research run is
 * still caught. Being late to stop costs nothing, because once the entry is
 * live the check returns early without firing anything.
 */
export const WATCH_WINDOWS = [
  { edition: 'opening', from: 9 * 60 + 5, to: 11 * 60 },
  { edition: 'closing', from: 17 * 60 + 20, to: 19 * 60 },
];

/** The current wall clock in New York, as {date, minutes}. */
export function easternNow(now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const [hour, minute] = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(now)
    .split(':')
    .map(Number);

  return { date, minutes: hour * 60 + minute };
}

/**
 * Which edition should already be on the site right now, or null.
 *
 * Null is the common answer and the correct one. The cron covers a UTC span
 * wide enough to hold both daylight saving offsets, which means roughly half
 * the firings land outside the Eastern window in any given season. Those are
 * meant to do nothing.
 */
export function dueEdition(now = new Date()) {
  const { minutes } = easternNow(now);
  const match = WATCH_WINDOWS.find((w) => minutes >= w.from && minutes < w.to);
  return match ? match.edition : null;
}

/**
 * The page that proves today's edition reached the site.
 *
 * A cache buster is required. GitHub Pages sends max-age=600, so without one
 * this could read a ten minute old 404 and fire a dispatch for an entry that
 * is already published.
 */
export function entryUrl(now = new Date(), edition = dueEdition(now)) {
  if (!edition) return null;
  const [year, month, day] = easternNow(now).date.split('-');
  return `${SITE}/${year}/${month}/${day}/${edition}/?trigger=${Date.now()}`;
}

/** Ask the live site whether the page exists. */
async function isLive(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Cache-Control': 'no-cache' },
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  return response.status === 200;
}

/** Tell GitHub Actions to run the publish workflow now. */
async function fireDispatch(token) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      // GitHub rejects API requests that do not identify themselves.
      'User-Agent': 'the-money-edit-rebuild-trigger',
    },
    body: JSON.stringify({ event_type: 'entry-published' }),
  });

  // 204 is success for this endpoint. Anything else is worth seeing in the log,
  // because a silently failing trigger is the exact failure this replaces.
  if (response.status !== 204) {
    throw new Error(`dispatch failed: ${response.status} ${await response.text()}`);
  }
}

/**
 * One tick. Decide whether a rebuild is owed, and knock if so.
 *
 * Returns a short description rather than nothing, so the same code path can
 * back both the cron handler and the read only status endpoint.
 */
export async function evaluate(env, now = new Date(), { dryRun = false } = {}) {
  const edition = dueEdition(now);
  if (!edition) return { action: 'skipped', reason: 'outside both watch windows' };

  const url = entryUrl(now, edition);
  if (await isLive(url)) return { action: 'skipped', reason: 'already live', edition };

  if (dryRun) return { action: 'would-dispatch', edition };

  await fireDispatch(env.GITHUB_TOKEN);
  return { action: 'dispatched', edition };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      evaluate(env).then((result) => {
        console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
      })
    );
  },

  /**
   * A read only status endpoint, for checking the Worker's reasoning without
   * waiting for a cron. It never fires a dispatch, so the public URL cannot be
   * used to force builds.
   */
  async fetch(request, env) {
    const now = new Date();
    const result = await evaluate(env, now, { dryRun: true });
    return Response.json({
      now: new Date().toISOString(),
      eastern: easternNow(now),
      ...result,
    });
  },
};
