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

import { escapeHtml, formatLongDate, formatShortDate, stableHash } from './util.js';

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
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">

<meta property="og:type" content="${canonicalPath === '/' ? 'website' : 'article'}">
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta name="twitter:card" content="summary_large_image">

<meta name="theme-color" content="#06070A">
<meta name="color-scheme" content="dark">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&amp;family=Inter:wght@400;500;600&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap">
<link rel="stylesheet" href="${url('assets/styles.css')}">
<link rel="icon" href="${url('assets/favicon.svg')}" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(SITE_NAME)}" href="${url('feed.xml')}">
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
<a class="wordmark" href="${url('/')}">${escapeHtml(SITE_NAME)}</a>
<nav class="masthead-nav" aria-label="Sections">
${link('/', 'Archive', 'archive')}
${link('/glossary/', 'Glossary', 'glossary')}
</nav>
</header>`;
}

function footer() {
  return `<footer class="site-footer">
<span>${escapeHtml(SITE_NAME)}</span>
<span>Written daily. Published from Notion.</span>
</footer>`;
}

/** The path an entry is published at. Date first so the archive sorts on disk. */
export function entryPath(entry) {
  return `/entries/${entry.date}-${entry.slug}/`;
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

  const parts = [];

  parts.push(`<article class="card">
<p class="card-date rise" style="--step:${step++}">${escapeHtml(formatLongDate(entry.date))}</p>
<h1 class="card-headline rise" style="--step:${step++}">${escapeHtml(entry.headline)}</h1>`);

  if (entry.summary) {
    parts.push(`<p class="card-lede rise" style="--step:${step++}">${escapeHtml(entry.summary)}</p>`);
  }

  if (entry.figures.length > 0) {
    parts.push(`<section class="figures rise" style="--step:${step++}" aria-labelledby="figures-heading">
<h2 class="sr-only" id="figures-heading">Key figures</h2>
<div class="figures-grid">
${entry.figures.map(figureTile).join('\n')}
</div>
</section>`);
  }

  for (const section of entry.sections) {
    parts.push(`<section class="section rise" style="--step:${step++}">
<h2 class="section-label">${escapeHtml(section.label)}</h2>
<div class="section-body">${section.html}</div>
</section>`);
  }

  if (entry.term) {
    parts.push(`<aside class="term rise" style="--step:${step++}">
<p class="term-label">Term of the day</p>
<h2 class="term-name">${escapeHtml(entry.term.term)}</h2>
<p class="term-definition">${escapeHtml(entry.term.definition)}</p>
</aside>`);
  }

  if (entry.source) {
    parts.push(`<p class="card-source rise" style="--step:${step++}">Source: <a href="${escapeHtml(
      entry.source.url
    )}" rel="noopener noreferrer nofollow" target="_blank">${escapeHtml(
      entry.source.title || entry.source.url
    )}</a></p>`);
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
    bodyClass: 'is-card',
    content: parts.join('\n'),
  });
}

function figureTile(figure) {
  return `<div class="figure" data-direction="${escapeHtml(figure.direction)}">
<span class="figure-label">${escapeHtml(figure.label)}</span>
<span class="figure-value">${escapeHtml(figure.value)}</span>
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
<span class="card-nav-title">${escapeHtml(entry.headline)}</span>
</a>`;
}

/* -------------------------------------------------------------------------
   Archive index
   ------------------------------------------------------------------------- */

export function renderArchive(entries, { windowDays = 30 } = {}) {
  // The whole site takes its tone from the most recent entry, so the palette
  // shifts day to day rather than staying fixed.
  const accent = accentFor(entries[0]?.date);

  const content = entries.length === 0 ? emptyState() : archiveList(entries, windowDays);

  return layout({
    title: SITE_NAME,
    description: SITE_TAGLINE,
    canonicalPath: '/',
    accent,
    bodyClass: 'is-archive',
    currentNav: 'archive',
    content: `<section class="hero rise" style="--step:0">
<h1 class="hero-title">The Money<br>Edit</h1>
<p class="hero-tagline">${escapeHtml(SITE_TAGLINE)}</p>
</section>
${content}`,
  });
}

function archiveList(entries, windowDays) {
  const rows = entries
    .map(
      (entry, index) => `<li class="archive-item rise" style="--step:${index + 1}">
<a class="archive-link" href="${url(entryPath(entry))}">
<span class="archive-date">${escapeHtml(formatShortDate(entry.date))}</span>
<span class="archive-title">${escapeHtml(entry.headline)}</span>
<span class="archive-arrow" aria-hidden="true">&rarr;</span>
</a>
</li>`
    )
    .join('\n');

  return `<div class="archive-heading rise" style="--step:1">
<h2>Recent entries</h2>
<span class="archive-count">Last ${windowDays} days · ${entries.length} ${
    entries.length === 1 ? 'entry' : 'entries'
  }</span>
</div>
<ul class="archive-list">
${rows}
</ul>`;
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
<h2 class="glossary-term">${escapeHtml(item.term)}</h2>
<p class="glossary-definition">${escapeHtml(item.definition)}</p>
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
