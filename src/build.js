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
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { requireNotionToken } from './config.js';
import { fetchAllRows, fetchPageBlocks, normalizeRow } from './notion.js';
import { parseEntry } from './parse.js';
import {
  renderCard,
  renderArchive,
  renderGlossary,
  renderFullArchive,
  renderLatestRedirect,
  renderManifest,
  entryPath,
  url,
  ORIGIN,
  SITE_NAME,
  SITE_TAGLINE,
} from './render.js';
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
export function selectPublishable(entries, today) {
  return entries.filter((entry) => {
    if (entry.status !== 'Published') return false;
    if (!entry.date) return false;
    return entry.date <= today;
  });
}

/**
 * Order entries newest first, and break a same day tie by substance.
 *
 * The tiebreak is not cosmetic. Only the first entry on a date gets the clean
 * /2026/08/14/ path that the morning notification can construct, and any
 * other entry that day is pushed to a suffixed URL. Sorting on date alone
 * left that choice to whatever order Notion happened to return, which meant a
 * one line stub could take the canonical URL and push the real writeup to
 * /2026/08/14/2/. The database already contains exactly that pair.
 *
 * Substance is measured by how much page body an entry has, then by the
 * length of its summary. The id is the final tiebreak purely so the ordering
 * is total and a rebuild can never produce different URLs from the same data.
 */
export function byDateThenSubstance(a, b) {
  if (a.date !== b.date) return b.date.localeCompare(a.date);

  const blocks = (b.blocks?.length ?? 0) - (a.blocks?.length ?? 0);
  if (blocks !== 0) return blocks;

  const summary = (b.summary?.length ?? 0) - (a.summary?.length ?? 0);
  if (summary !== 0) return summary;

  return String(a.id).localeCompare(String(b.id));
}

/**
 * Give every entry a stable, unique path segment.
 *
 * The date leads so that paths sort chronologically. A suffix is only added
 * when two entries on the same day also share a headline, which has not
 * happened yet but costs three lines to make impossible.
 */
export function assignSlugs(entries) {
  // How many entries already seen for a given date. The first entry of a day
  // gets the clean /2026/08/18/ path, which is the one the morning
  // notification can construct without knowing anything but the date. Any
  // second entry that day is suffixed rather than colliding.
  const perDate = new Map();

  for (const entry of entries) {
    const seen = perDate.get(entry.date) ?? 0;
    entry.dateIndex = seen;
    perDate.set(entry.date, seen + 1);
    entry.slug = slugify(entry.headline) || 'entry';
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
export function collectGlossary(entries) {
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

/**
 * A 180 by 180 home screen icon, encoded as a PNG by hand.
 *
 * iOS ignores SVG for apple-touch-icon, so a raster file is required, and
 * this project has no image library and is not going to gain one for a single
 * 180 pixel square. A PNG is a signature followed by three chunks, and the
 * pixel data is just deflated scanlines, both of which node:zlib already
 * provides. The whole thing is about forty lines.
 *
 * The mark matches the favicon and the wordmark: two offset squares.
 */
function touchIconPng() {
  const size = 180;
  const background = [0x06, 0x07, 0x0a];
  const squares = [
    { x: 39, y: 39, side: 46, rgb: [0xe8, 0xc8, 0x8a] }, // champagne
    { x: 95, y: 95, side: 46, rgb: [0x8f, 0xc7, 0xe8] }, // ice
  ];

  // Raw scanlines. Each row is prefixed with a zero byte, the PNG filter type
  // meaning "no filtering", which keeps the encoder trivial.
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    raw[offset++] = 0;
    for (let x = 0; x < size; x += 1) {
      const hit = squares.find(
        (s) => x >= s.x && x < s.x + s.side && y >= s.y && y < s.y + s.side
      );
      const [r, g, b] = hit ? hit.rgb : background;
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type 2, truecolour RGB
  // bytes 10 to 12 stay zero: deflate compression, adaptive filtering, no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Length, type, payload, CRC. The CRC covers the type and the payload. */
function pngChunk(type, payload) {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), payload]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([header, body, crc]);
}

/**
 * CRC-32 as PNG specifies it. node:zlib gained a crc32 export after Node 18,
 * and the engines field allows Node 18, so it is implemented here rather than
 * silently requiring a newer runtime.
 */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

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

/** Same as write, but for a Buffer, so no encoding is applied. */
async function writeBinary(relativePath, buffer) {
  const target = join(OUT, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer);
}

/* -------------------------------------------------------------------------
   Main
   ------------------------------------------------------------------------- */

async function main() {
  const started = Date.now();
  const today = todayInNewYork();

  const all = await loadEntries();
  const published = assignSlugs(
    selectPublishable(all, today).sort(byDateThenSubstance)
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

  const older = published.length - recent.length;
  await write(
    'index.html',
    renderArchive(recent, { windowDays: ARCHIVE_WINDOW_DAYS, olderCount: older })
  );

  // Built unconditionally rather than only when the window overflows, so the
  // address is stable and never 404s once someone has linked to it.
  if (published.length > 0) {
    await write('archive/index.html', renderFullArchive(published));
  }
  await write(
    'glossary/index.html',
    renderGlossary(collectGlossary(published), { latestDate: published[0]?.date ?? null })
  );

  // The address the morning push notification points at. Written even when
  // nothing is published, so the link never 404s.
  if (published.length > 0) {
    await write('latest/index.html', renderLatestRedirect(published[0]));
  }

  await write('manifest.webmanifest', renderManifest());
  await write('404.html', render404());
  await write('feed.xml', renderFeed(published));
  await write(
    'sitemap.xml',
    // /latest/ is deliberately excluded. It is a redirect, and indexing it
    // would compete with the entry it points at.
    renderSitemap(['/', '/archive/', '/glossary/', ...published.map(entryPath)])
  );
  await write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}${url('sitemap.xml')}\n`);

  // Tells GitHub Pages to serve the files as they are rather than running
  // them through Jekyll, which would otherwise skip anything underscored.
  await write('.nojekyll', '');

  await mkdir(join(OUT, 'assets'), { recursive: true });
  await copyFile(join(ROOT, 'assets/styles.css'), join(OUT, 'assets/styles.css'));
  await write('assets/favicon.svg', faviconSvg());
  // iOS ignores SVG for the home screen icon, so a PNG is required. This is a
  // tiny hand assembled file rather than a build dependency on an image
  // library, which the project deliberately does not have.
  await writeBinary('assets/icon.png', touchIconPng());

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

// Run only when this file is executed directly. Guarding it means the policy
// functions above can be imported by tests without kicking off a build, which
// is what makes the publishing rules testable at all.
const executedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executedDirectly) {
  main().catch((error) => {
    console.error(`\nBuild failed.\n${error.message}\n`);
    process.exit(1);
  });
}
