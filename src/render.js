/**
 * HTML generation. Pure functions in, strings out.
 *
 * Nothing in this file reads the filesystem, calls the network, or looks at
 * the clock. Given the same entries it produces the same bytes, which is what
 * makes the output diffable and the tests straightforward.
 *
 * There is no template engine and no client side JavaScript. Template
 * literals cover everything a three page site needs, and shipping no script
 * means the site works with scripting disabled and has nothing to hydrate.
 */

import { escapeHtml, escapeText, formatLongDate, formatShortDate, stableHash } from './util.js';

/**
 * Where the site is served from.
 *
 * Today that is a GitHub project page, so every internal link needs the
 * repository name as a prefix. Moving to a custom domain later means setting
 * SITE_BASE to an empty string and SITE_ORIGIN to the domain. Keeping both in
 * one place is what makes that a one line change rather than a search and
 * replace across the templates.
 */
export const BASE = process.env.SITE_BASE ?? '/the-money-edit';
export const ORIGIN = process.env.SITE_ORIGIN ?? 'https://aidenmark.github.io';

export const SITE_NAME = 'The Money Edit';
export const SITE_TAGLINE =
  'A daily read on markets and money, written plainly, so you can tell what it means for yours.';

/** Build an absolute path within the site, collapsing any doubled slashes. */
export function url(path = '/') {
  return `${BASE}/${String(path).replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/');
}

/** The eight accent tones defined in the stylesheet. */
const ACCENT_COUNT = 8;

/**
 * Choose the accent for a page from a date.
 *
 * Hashing the date rather than the headline means an entry keeps its tone
 * even if the headline is edited in Notion after publishing.
 */
export function accentFor(isoDate) {
  const hash = stableHash(isoDate ?? 'the-money-edit');
  return {
    className: `accent-${hash % ACCENT_COUNT}`,
    // Nudge the light source around so consecutive days do not look identical
    // even when they land on the same tone.
    bloomX: `${30 + (hash >>> 3) % 41}%`,
    bloomY: `${-6 + (hash >>> 7) % 22}%`,
  };
}

/**
 * The shared page shell.
 *
 * The font link is a single request covering all three families. display=swap
 * means text paints in the fallback immediately rather than leaving the page
 * blank while fonts load, which matters most on the phone where these get
 * opened from a notification.
 */
export function layout({
  title,
  description,
  canonicalPath = '/',
  accent,
  bodyClass = '',
  content,
  currentNav = '',
}) {
  const fullTitle = title === SITE_NAME ? title : `${title} · ${SITE_NAME}`;
  const canonical = `${ORIGIN}${url(canonicalPath)}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeText(fullTitle)}</title>
<meta name="description" content="${escapeText(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">

<meta property="og:type" content="${canonicalPath === '/' ? 'website' : 'article'}">
<meta property="og:site_name" content="${escapeText(SITE_NAME)}">
<meta property="og:title" content="${escapeText(title)}">
<meta property="og:description" content="${escapeText(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta name="twitter:card" content="summary_large_image">

<meta name="theme-color" content="#06070A">
<meta name="color-scheme" content="dark">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&amp;family=Inter:wght@400;500;600&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap">
<link rel="stylesheet" href="${url('assets/styles.css')}">
<link rel="icon" href="${url('assets/favicon.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${url('assets/icon.png')}">
<link rel="manifest" href="${url('manifest.webmanifest')}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Money Edit">
<link rel="alternate" type="application/rss+xml" title="${escapeText(SITE_NAME)}" href="${url('feed.xml')}">
</head>
<body class="${escapeHtml(`${accent.className} ${bodyClass}`.trim())}" style="--bloom-x:${accent.bloomX};--bloom-y:${accent.bloomY}">
<a class="skip-link" href="#main">Skip to content</a>
<div class="bloom" aria-hidden="true"></div>
<div class="grid-overlay" aria-hidden="true"></div>
<div class="page">
<div class="rail" aria-hidden="true"></div>
${masthead(currentNav)}
<main id="main">
${content}
</main>
${footer()}
</div>
</body>
</html>
`;
}

function masthead(current) {
  const link = (href, label, key) =>
    `<a href="${url(href)}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`;

  return `<header class="masthead">
<a class="wordmark" href="${url('/')}">${escapeText(SITE_NAME)}</a>
<nav class="masthead-nav" aria-label="Sections">
${link('/', 'Archive', 'archive')}
${link('/glossary/', 'Glossary', 'glossary')}
</nav>
</header>`;
}

function footer() {
  return `<footer class="site-footer">
<span>${escapeText(SITE_NAME)}</span>
<span>Written daily. Published from Notion.</span>
</footer>`;
}

/**
 * The path an entry is published at.
 *
 * Date only, as /2026/08/18/. The headline is deliberately not in the URL.
 *
 * The reason is the morning notification. A static site cannot send one, so
 * the push comes from the scheduled task, and for it to link straight to the
 * day's card the URL has to be constructible from the date alone. A slug
 * would require knowing the headline before it is written, which the sender
 * does not.
 *
 * Two entries can share a date, which has already happened once, so a second
 * entry on the same day takes a numbered suffix. The first keeps the clean
 * path so the predictable form stays predictable.
 */
export function entryPath(entry) {
  const [year, month, day] = entry.date.split('-');
  const suffix = entry.dateIndex > 0 ? `${entry.dateIndex + 1}/` : '';
  return `/${year}/${month}/${day}/${suffix}`;
}

/* -------------------------------------------------------------------------
   Entry card
   ------------------------------------------------------------------------- */

/**
 * Render one daily card.
 *
 * Blocks are numbered as they are emitted and the number is written out as
 * the --step custom property. The stylesheet turns that into an animation
 * delay, so the page assembles itself top to bottom without the renderer
 * needing to know anything about timing.
 */
export function renderCard(entry, { previous = null, next = null } = {}) {
  const accent = accentFor(entry.date);
  let step = 0;
  const rise = () => `class="widget rise" style="--step:${step++}"`;

  // The first three figures are the headline numbers and get the large tiles.
  // Anything past that is still shown, as a quieter list underneath, so no
  // reported figure is ever dropped just because it did not fit the design.
  const headline = entry.figures.slice(0, 3);
  const rest = entry.figures.slice(3);

  const parts = ['<article class="entry">'];

  /* The datestamp sits outside the cards, above the stack.
   *
   * It used to live inside the opening bell card, which meant an entry with
   * no key figures rendered with no date anywhere on the page. That is a real
   * defect for a daily brief, and it will happen the moment the content
   * broadens past markets, since a car or travel entry has no index levels to
   * report. The stamp also carries the pulse, so every entry keeps the signal
   * that this is a dated, freshly filed thing rather than an undated article.
   */
  parts.push(`<p class="entry-stamp rise" style="--step:${step++}">
<span class="bell-dot" aria-hidden="true"></span>
<time datetime="${escapeHtml(entry.date)}">${escapeText(formatLongDate(entry.date))}</time>
</p>`);

  // The opening bell card is the numbers, and only the numbers. When an entry
  // reports none, the card is absent rather than empty.
  if (entry.figures.length > 0) {
    parts.push(`<section ${rise().replace('widget', 'widget widget--bell')} aria-labelledby="bell-heading">
<p class="bell-strip" id="bell-heading">Opening bell</p>
<div class="tape">
${headline.map(tapeTile).join('\n')}
</div>${
      rest.length
        ? `
<div class="bell-rest">
${rest.map(restRow).join('\n')}
</div>`
        : ''
    }
</section>`);
  }

  const story = [`<h1 class="entry-headline">${escapeText(entry.headline)}</h1>`];
  for (const section of entry.sections) {
    // "What it means for you" is the reason this project exists, so it is
    // lifted out of the run of prose rather than being the third of three.
    const payoff = section.key === 'what-it-means' ? ' section--payoff' : '';
    story.push(`<section class="section${payoff}">
<h2 class="section-label">${escapeText(section.label)}</h2>
<div class="section-body">${section.html}</div>
</section>`);
  }
  parts.push(`<section ${rise().replace('widget', 'widget widget--story')}>
${story.join('\n')}
</section>`);

  if (entry.term) {
    parts.push(`<aside ${rise().replace('widget', 'widget widget--term')}>
<p class="term-label">Term of the day</p>
<h2 class="term-name">${escapeText(entry.term.term)}</h2>
<p class="term-definition">${escapeText(entry.term.definition)}</p>
</aside>`);
  }

  // Attribution gets its own card rather than a line of small print. This
  // writing is a summary of other people's reporting, so who did that
  // reporting is part of the entry, not a footnote to it. Titles are
  // reproduced exactly as published.
  if (entry.sources.length > 0) {
    parts.push(`<section ${rise()} aria-labelledby="sources-heading">
<p class="term-label" id="sources-heading">${
      entry.sources.length === 1 ? 'Source' : 'Sources'
    }</p>
<ul class="source-list">
${entry.sources
  .map(
    (source) => `<li><a href="${escapeHtml(source.url)}" rel="noopener noreferrer nofollow" target="_blank">
<span class="source-title">${escapeHtml(source.title)}</span>
<span class="source-host">${escapeHtml(hostOf(source.url))}</span>
</a></li>`
  )
  .join('\n')}
</ul>
</section>`);
  }

  parts.push('</article>');

  if (previous || next) {
    parts.push(`<nav class="card-nav rise" style="--step:${step++}" aria-label="More entries">
${navLink(previous, 'previous')}
${navLink(next, 'next')}
</nav>`);
  }

  return layout({
    title: entry.headline,
    description: entry.summary || `${SITE_NAME} for ${formatLongDate(entry.date)}.`,
    canonicalPath: entryPath(entry),
    accent,
    bodyClass: 'is-entry',
    content: parts.join('\n'),
  });
}

/**
 * Split a figure value into the number to show large and the movement to show
 * beneath it.
 *
 * Entries phrase figures three ways, so three shapes are handled:
 *
 *   "0.5% to 7,703.78"          the level is what moved to, 0.5% is the move
 *   "5.30%, highest since 2007" the level is the number, the rest is a note
 *   "4.72%"                     just a level
 *
 * This is presentation, not parsing, which is why it lives here rather than in
 * parse.js. The stored figure keeps the full phrase the writer used.
 */
export function splitFigure(figure) {
  const value = String(figure.value ?? '');
  let level;
  let change;

  // "0.5% to 7,703.78". The number after "to" is where it landed.
  const moved = /^(.+?)\s+to\s+(.+)$/.exec(value);

  // "53,483 down 0.46%". A leading number is the level and the rest is the
  // move. The number pattern has to swallow its own thousands separators,
  // which is the bug this replaced: splitting on the first comma turned
  // "53,483 down 0.46%" into a level of "53".
  const leading =
    /^(?:about|roughly|around|approximately|above|below|near|over|under)?\s*(\$?\d[\d.,]*%?)\s+(.+)$/i.exec(
      value
    );

  // "5.30%, highest since 2007". The comma must be followed by a space, or a
  // thousands separator would match here too.
  const noted = /^([^,]+),\s+(.+)$/.exec(value);

  if (moved) {
    [, change, level] = moved;
  } else if (leading) {
    [, level, change] = leading;
  } else if (noted) {
    [, level, change] = noted;
  } else {
    level = value || figure.label;
    change = '';
  }

  // The tile prefixes an arrow, so a change that also opens with the word
  // would read "arrow down 0.46%".
  if (figure.direction && figure.direction !== 'flat') {
    change = change.replace(
      /^(down|up|fell|rose|climbed|gained|slipped|dropped|declined|lower|higher|surged|jumped)\b\s*/i,
      ''
    );
  }

  return { level, change: change.trim() };
}

/**
 * The publisher, derived from the URL, shown beside the article title so
 * credit is legible at a glance without reading the whole headline.
 */
export function hostOf(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    // A malformed URL should not take the page down. Showing no publisher is
    // survivable, showing a crash is not.
    return '';
  }
}

/**
 * Shorten a label for the large tiles.
 *
 * The tiles are deliberately narrow, and a wrapped or truncated label undoes
 * the point of them. Only the tile is shortened. The full name is kept as the
 * title attribute, and the quieter list below uses the original wording, so
 * nothing is actually lost.
 */
export function shortenLabel(label) {
  const text = String(label ?? '').trim();

  if (/^dow jones/i.test(text)) return 'Dow';
  if (/^nasdaq composite$/i.test(text)) return 'Nasdaq';

  // "30-year Treasury yield" reads better as "30Y Treasury" at this size.
  const treasury = /^(\d+)[\s-]*year\s+(.+?)(\s+yield)?$/i.exec(text);
  if (treasury) return `${treasury[1]}Y ${treasury[2]}`;

  return text.replace(/\s+yield$/i, '');
}

function tapeTile(figure) {
  const { level, change } = splitFigure(figure);
  return `<div class="tape-tile" data-direction="${escapeHtml(figure.direction)}">
<span class="tape-label" title="${escapeText(figure.label)}">${escapeText(shortenLabel(figure.label))}</span>
<span class="tape-value">${escapeText(level)}</span>${
    change ? `\n<span class="tape-change">${escapeText(change)}</span>` : ''
  }
</div>`;
}

function restRow(figure) {
  return `<div class="bell-row" data-direction="${escapeHtml(figure.direction)}">
<span class="bell-row-label">${escapeText(figure.label)}</span>
<span class="bell-row-value">${escapeText(figure.value)}</span>
</div>`;
}

/**
 * One side of the previous and next pair.
 *
 * When there is no neighbour an empty span holds the grid column open, so the
 * next link stays hard right on the oldest entry instead of sliding left.
 */
function navLink(entry, direction) {
  if (!entry) return '<span></span>';
  const label = direction === 'previous' ? 'Previous' : 'Next';
  return `<a class="card-nav-link is-${direction}" href="${url(entryPath(entry))}">
<span class="card-nav-direction">${label}</span>
<span class="card-nav-title">${escapeText(entry.headline)}</span>
</a>`;
}

/* -------------------------------------------------------------------------
   Archive index
   ------------------------------------------------------------------------- */

export function renderArchive(entries, { windowDays = 30, olderCount = 0 } = {}) {
  // The whole site takes its tone from the most recent entry, so the palette
  // shifts day to day rather than staying fixed.
  const accent = accentFor(entries[0]?.date);

  const content =
    entries.length === 0 ? emptyState() : archiveList(entries, windowDays, olderCount);

  return layout({
    title: SITE_NAME,
    description: SITE_TAGLINE,
    canonicalPath: '/',
    accent,
    bodyClass: 'is-archive',
    currentNav: 'archive',
    content: `<section class="hero rise" style="--step:0">
<h1 class="hero-title">The Money Edit</h1>
<p class="hero-tagline">${escapeText(SITE_TAGLINE)}</p>
</section>
${content}`,
  });
}

function archiveList(entries, windowDays, olderCount = 0) {
  const rows = entries
    .map(
      (entry, index) => `<li class="archive-item rise" style="--step:${index + 1}">
<a class="archive-link" href="${url(entryPath(entry))}">
<span class="archive-date">${escapeText(formatShortDate(entry.date))}</span>
<span class="archive-title">${escapeText(entry.headline)}</span>
<span class="archive-arrow" aria-hidden="true">&rarr;</span>
</a>
</li>`
    )
    .join('\n');

  // Anything past the window still exists and still has a page. Without this
  // link the only route to it would be the previous and next chain, which is
  // not a way anyone finds a three month old entry.
  const more =
    olderCount > 0
      ? `\n<p class="archive-more rise" style="--step:${entries.length + 2}">
<a href="${url('/archive/')}">See all ${entries.length + olderCount} entries &rarr;</a>
</p>`
      : '';

  return `<div class="archive-heading rise" style="--step:1">
<h2>Recent entries</h2>
<span class="archive-count">Last ${windowDays} days · ${entries.length} ${
    entries.length === 1 ? 'entry' : 'entries'
  }</span>
</div>
<ul class="archive-list">
${rows}
</ul>${more}`;
}

/**
 * The complete archive, every entry ever published, grouped by month.
 *
 * The front page deliberately shows only a window, because a landing page
 * listing two years of entries is not a landing page. This is where the rest
 * lives, and it is the only page that grows without bound, which is why it
 * groups by month rather than running as one flat list.
 */
export function renderFullArchive(entries) {
  const accent = accentFor(entries[0]?.date);

  // Entries arrive newest first, so the month keys come out in order already.
  const months = new Map();
  for (const entry of entries) {
    const key = entry.date.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(entry);
  }

  const sections = [...months.entries()]
    .map(
      ([month, group], index) => `<section class="rise" style="--step:${index + 1}">
<div class="archive-heading">
<h2>${escapeText(formatMonth(month))}</h2>
<span class="archive-count">${group.length} ${group.length === 1 ? 'entry' : 'entries'}</span>
</div>
<ul class="archive-list">
${group
  .map(
    (entry) => `<li class="archive-item">
<a class="archive-link" href="${url(entryPath(entry))}">
<span class="archive-date">${escapeText(formatShortDate(entry.date))}</span>
<span class="archive-title">${escapeText(entry.headline)}</span>
<span class="archive-arrow" aria-hidden="true">&rarr;</span>
</a>
</li>`
  )
  .join('\n')}
</ul>
</section>`
    )
    .join('\n');

  return layout({
    title: 'All entries',
    description: `Every entry of ${SITE_NAME}, grouped by month.`,
    canonicalPath: '/archive/',
    accent,
    bodyClass: 'is-archive',
    currentNav: 'archive',
    content: `<section class="hero rise" style="--step:0">
<h1 class="hero-title">All entries</h1>
<p class="hero-tagline">${entries.length} ${
      entries.length === 1 ? 'entry' : 'entries'
    } so far, newest first.</p>
</section>
${sections}`,
  });
}

/** "2026-08" becomes "August 2026". Used as the month heading. */
function formatMonth(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/**
 * Shown when nothing has been promoted out of Draft yet.
 *
 * This is a real state rather than a defensive one. Every entry is filed as a
 * draft by the scheduled task and stays that way until it is reviewed, so a
 * freshly built site legitimately has nothing on it and should still look
 * finished.
 */
function emptyState() {
  return `<div class="empty rise" style="--step:1">
<h2>Nothing published yet</h2>
<p>Entries are written each weekday morning and appear here once they have been reviewed.</p>
</div>`;
}

/* -------------------------------------------------------------------------
   Glossary
   ------------------------------------------------------------------------- */

/**
 * The glossary is not authored separately. It accumulates from the term of
 * the day on each entry, which is the whole point. The vocabulary builds up
 * as a side effect of reading daily rather than as a task of its own.
 */
export function renderGlossary(terms, { latestDate = null } = {}) {
  const accent = accentFor(latestDate);

  const content =
    terms.length === 0
      ? `<div class="empty rise" style="--step:1">
<h2>The glossary is still filling up</h2>
<p>Each entry defines one term. They collect here as they are published.</p>
</div>`
      : `<ul class="glossary-list">
${terms
  .map(
    (item, index) => `<li class="glossary-item rise" style="--step:${index + 1}">
<h2 class="glossary-term">${escapeText(item.term)}</h2>
<p class="glossary-definition">${escapeText(item.definition)}</p>
<a class="glossary-source" href="${url(entryPath(item.entry))}">Defined ${escapeHtml(
      formatLongDate(item.entry.date)
    )}</a>
</li>`
  )
  .join('\n')}
</ul>`;

  return layout({
    title: 'Glossary',
    description:
      'Financial terms defined in plain language, collected from the daily entries as they appear.',
    canonicalPath: '/glossary/',
    accent,
    bodyClass: 'is-glossary',
    currentNav: 'glossary',
    content: `<section class="hero rise" style="--step:0">
<h1 class="hero-title">Glossary</h1>
<p class="hero-tagline">One term per entry, defined plainly, collected here as they appear.</p>
</section>
${content}`,
  });
}

/**
 * A standing redirect at /latest/ that always lands on the newest entry.
 *
 * This is the address the morning push notification should use. It never
 * needs to know the date, it cannot go stale, and it survives an entry being
 * unpublished. A meta refresh is used rather than a server rule because
 * GitHub Pages serves static files and has no redirect layer.
 *
 * The canonical link points at the real entry so search engines index that
 * rather than this, and the body carries a plain link for anyone whose
 * browser blocks the refresh.
 */
export function renderLatestRedirect(entry) {
  const target = url(entryPath(entry));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=${escapeHtml(target)}">
<link rel="canonical" href="${escapeHtml(`${ORIGIN}${target}`)}">
<meta name="robots" content="noindex">
<title>${escapeText(SITE_NAME)}</title>
</head>
<body>
<p><a href="${escapeHtml(target)}">${escapeText(entry.headline)}</a></p>
</body>
</html>
`;
}

/**
 * The web app manifest, so adding the site to a phone home screen produces an
 * app icon and a standalone window rather than a browser bookmark. This is
 * most of what makes a notification feel like it opens an app.
 */
export function renderManifest() {
  return JSON.stringify(
    {
      name: SITE_NAME,
      short_name: 'Money Edit',
      description: SITE_TAGLINE,
      start_url: url('/latest/'),
      scope: url('/'),
      display: 'standalone',
      background_color: '#06070A',
      theme_color: '#06070A',
      icons: [
        // The SVG scales to any launcher size. The PNG is the fallback for
        // platforms that will not accept SVG, iOS among them.
        { src: url('assets/favicon.svg'), sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: url('assets/icon.png'), sizes: '180x180', type: 'image/png', purpose: 'any' },
        { src: url('assets/icon.png'), sizes: '180x180', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2
  );
}
