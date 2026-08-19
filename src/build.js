/**
 * Build entry point. Run with `npm run build`.
 *
 * The whole site is regenerated from scratch every time. There is no
 * incremental step and no cache to invalidate, because the input is a few
 * dozen short entries and a full build takes about a second. Simplicity is
 * worth more here than speed.
 *
 * Flags
 *   --offline   Build from the committed test fixtures instead of calling
 *               Notion. Useful for working on the design on a plane, and for
 *               proving in CI that the templates render without a token.
 *   --out DIR   Write somewhere other than dist.
 *
 * Publishing policy lives in this file rather than in notion.js. Deciding
 * what the public should see is a product decision, not a transport concern.
 */

import { mkdir, rm, writeFile, copyFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireNotionToken } from './config.js';
import { fetchAllRows, fetchPageBlocks, normalizeRow } from './notion.js';
import { parseEntry } from './parse.js';
import { renderCard, renderArchive, renderGlossary, entryPath, url, ORIGIN, SITE_NAME, SITE_TAGLINE } from './render.js';
import { todayInNewYork, daysBetween, slugify, escapeHtml } from './util.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** How many days of entries the front page lists before falling back to the
 *  complete index. Taken straight from the brief. */
const ARCHIVE_WINDOW_DAYS = 30;

const args = process.argv.slice(2);
const OFFLINE = args.includes('--offline');
const OUT = valueOf('--out') ?? join(ROOT, 'dist');

function valueOf(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

/* -------------------------------------------------------------------------
   Loading
   ------------------------------------------------------------------------- */

/**
 * Read every entry, either from Notion or from the fixtures.
 *
 * The two paths return the same shape on purpose. Everything after this
 * function is identical whichever source was used, which is what makes the
 * offline build a genuine test of the real thing rather than a separate
 * code path that can drift.
 */
async function loadEntries() {
  if (OFFLINE) {
    const fixture = JSON.parse(
      await readFile(join(ROOT, 'test/fixtures/entries.json'), 'utf8')
    );
    console.log(`Offline build using ${fixture.entries.length} fixture entries.`);
    return fixture.entries;
  }

  const token = requireNotionToken();
  const { rows, apiVersion } = await fetchAllRows(token);
  console.log(`Read ${rows.length} rows from Notion using API version ${apiVersion}.`);

  const entries = rows.map(normalizeRow);

  // Page bodies need one call each. They are fetched in parallel because the
  // volume is small and Notion's rate limit sits around three requests per
  // second, which a few dozen entries stays comfortably under.
  await Promise.all(
    entries.map(async (entry) => {
      entry.blocks = await fetchPageBlocks(token, apiVersion, entry.id);
    })
  );

  return entries;
}

/* -------------------------------------------------------------------------
   Policy
   ------------------------------------------------------------------------- */

/**
 * Decide what the public sees.
 *
 * Two conditions, both deliberate. Status must be Published, which is the
 * editorial gate and the reason drafts can sit in Notion safely. And the date
 * must not be in the future, resolved in New York, so an entry can be written
 * and approved ahead of time without appearing early.
 */
function selectPublishable(entries, today) {
  return entries.filter((entry) => {
    if (entry.status !== 'Published') return false;
    if (!entry.date) return false;
    return entry.date <= today;
  });
}

/**
 * Give every entry a stable, unique path segment.
 *
 * The date leads so that paths sort chronologically. A suffix is only added
 * when two entries on the same day also share a headline, which has not
 * happened yet but costs three lines to make impossible.
 */
function assignSlugs(entries) {
  const taken = new Set();
  for (const entry of entries) {
    const base = slugify(entry.headline) || 'entry';
    let slug = base;
    let counter = 2;
    while (taken.has(`${entry.date}-${slug}`)) {
      slug = `${base}-${counter++}`;
    }
    taken.add(`${entry.date}-${slug}`);
    entry.slug = slug;
  }
  return entries;
}

/**
 * Collect the glossary from the term of the day on each entry.
 *
 * When a term is defined more than once the earliest definition wins, so the
 * glossary credits the day a reader first met the word. Comparison is
 * case insensitive because "Treasury yield" and "treasury yield" are the
 * same term written on different mornings.
 */
function collectGlossary(entries) {
  const byTerm = new Map();

  // Oldest first, so the first write for a term is the earliest one.
  for (const entry of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!entry.term?.term) continue;
    const key = entry.term.term.toLowerCase();
    if (byTerm.has(key)) continue;
    byTerm.set(key, { ...entry.term, entry });
  }

  return [...byTerm.values()].sort((a, b) =>
    a.term.localeCompare(b.term, 'en', { sensitivity: 'base' })
  );
}

/* -------------------------------------------------------------------------
   Extra files
   ------------------------------------------------------------------------- */

/** A mark rather than a letterform. The square is the same one the wordmark
 *  uses, which keeps the tab consistent with the page. */
function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" rx="7" fill="#06070A"/>
<rect x="7" y="7" width="8" height="8" fill="#E8C88A"/>
<rect x="17" y="17" width="8" height="8" fill="#8FC7E8"/>
</svg>
`;
}

/** RSS 2.0. Dates must be RFC 822, which is why they are assembled by hand
 *  rather than taken from toISOString. */
function renderFeed(entries) {
  const items = entries
    .slice(0, 40)
    .map((entry) => {
      const link = `${ORIGIN}${url(entryPath(entry))}`;
      return `  <item>
    <title>${escapeHtml(entry.headline)}</title>
    <link>${escapeHtml(link)}</link>
    <guid isPermaLink="true">${escapeHtml(link)}</guid>
    <pubDate>${rfc822(entry.date)}</pubDate>
    <description>${escapeHtml(entry.summary)}</description>
  </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${escapeHtml(SITE_NAME)}</title>
  <link>${escapeHtml(`${ORIGIN}${url('/')}`)}</link>
  <description>${escapeHtml(SITE_TAGLINE)}</description>
  <language>en-us</language>
  <atom:link href="${escapeHtml(`${ORIGIN}${url('feed.xml')}`)}" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>
`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format a plain date as RFC 822, pinned to UTC so the day never shifts. */
function rfc822(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return `${WEEKDAYS[date.getUTCDay()]}, ${String(day).padStart(2, '0')} ${
    MONTHS[month - 1]
  } ${year} 12:00:00 GMT`;
}

function renderSitemap(paths) {
  const urls = paths
    .map((path) => `  <url><loc>${escapeHtml(`${ORIGIN}${url(path)}`)}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.w3.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/** GitHub Pages serves this for any unmatched path. */
function render404() {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not found · ${escapeHtml(SITE_NAME)}</title>
<link rel="stylesheet" href="${url('assets/styles.css')}">
</head>
<body class="accent-0">
<div class="page">
<div class="rail" aria-hidden="true"></div>
<div class="empty" style="opacity:1">
<h2>That page is not here</h2>
<p><a href="${url('/')}" style="color:var(--accent)">Back to the latest entry</a></p>
</div>
</div>
</body></html>
`;
}

/* -------------------------------------------------------------------------
   Writing
   ------------------------------------------------------------------------- */

async function write(relativePath, contents) {
  const target = join(OUT, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, 'utf8');
}

/* -------------------------------------------------------------------------
   Main
   ------------------------------------------------------------------------- */

async function main() {
  const started = Date.now();
  const today = todayInNewYork();

  const all = await loadEntries();
  const published = assignSlugs(
    selectPublishable(all, today).sort((a, b) => b.date.localeCompare(a.date))
  ).map(parseEntry);

  console.log(
    `${published.length} of ${all.length} entries are published and dated on or before ${today}.`
  );

  // A clean output directory guarantees that an entry unpublished in Notion
  // actually disappears from the site rather than lingering as a stale file.
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  // Every entry page, with links to the entries either side of it. The list
  // is newest first, so the next newer entry is at the lower index.
  for (let i = 0; i < published.length; i += 1) {
    const entry = published[i];
    await write(
      join(entryPath(entry).replace(/^\//, ''), 'index.html'),
      renderCard(entry, { next: published[i - 1] ?? null, previous: published[i + 1] ?? null })
    );
  }

  const recent = published.filter(
    (entry) => daysBetween(entry.date, today) <= ARCHIVE_WINDOW_DAYS
  );

  await write('index.html', renderArchive(recent, { windowDays: ARCHIVE_WINDOW_DAYS }));
  await write(
    'glossary/index.html',
    renderGlossary(collectGlossary(published), { latestDate: published[0]?.date ?? null })
  );

  await write('404.html', render404());
  await write('feed.xml', renderFeed(published));
  await write(
    'sitemap.xml',
    renderSitemap(['/', '/glossary/', ...published.map(entryPath)])
  );
  await write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}${url('sitemap.xml')}\n`);

  // Tells GitHub Pages to serve the files as they are rather than running
  // them through Jekyll, which would otherwise skip anything underscored.
  await write('.nojekyll', '');

  await mkdir(join(OUT, 'assets'), { recursive: true });
  await copyFile(join(ROOT, 'assets/styles.css'), join(OUT, 'assets/styles.css'));
  await write('assets/favicon.svg', faviconSvg());

  const withFigures = published.filter((entry) => entry.figures.length > 0).length;
  const withTerms = published.filter((entry) => entry.term).length;
  console.log(
    `Built ${published.length} entry pages in ${Date.now() - started}ms. ` +
      `${withFigures} carry key figures, ${withTerms} define a term.`
  );
  if (published.length === 0) {
    console.log('Nothing is published yet, so the site built with its empty state.');
  }
}

main().catch((error) => {
  console.error(`\nBuild failed.\n${error.message}\n`);
  process.exit(1);
});
