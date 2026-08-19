/**
 * Shared helpers with no knowledge of Notion or of HTML templates.
 *
 * Everything here is a pure function. Given the same input it returns the
 * same output, which is what lets the whole site be rebuilt from scratch on
 * every run and still produce byte identical pages for entries that have not
 * changed.
 */

/** The newsroom timezone. Every date in this project is resolved against it. */
export const TIMEZONE = 'America/New_York';

/**
 * Today's date as a plain YYYY-MM-DD string in New York.
 *
 * This matters more than it looks. An entry filed at 10:36pm Eastern is
 * already tomorrow in UTC, and reading the date off the server clock produced
 * a wrong date on the very first entry of this project. The build runs on a
 * GitHub runner set to UTC, so the timezone has to be stated, never inferred.
 *
 * The en-CA locale is used because it formats as YYYY-MM-DD, which sorts
 * correctly as a string and matches the format Notion stores dates in.
 */
export function todayInNewYork(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Turn a plain YYYY-MM-DD string into a display date such as
 * "Tuesday, August 18, 2026".
 *
 * The date is deliberately reconstructed with Date.UTC and then formatted in
 * UTC. Passing "2026-08-18" straight to new Date() yields midnight UTC, and
 * formatting that in New York rolls it back to August 17. Treating a plain
 * date as a UTC calendar date and never converting it sidesteps the problem
 * entirely.
 */
export function formatLongDate(isoDate) {
  const parts = parseIsoDate(isoDate);
  if (!parts) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parts);
}

/** A compact display date such as "Aug 18". Used in the archive list. */
export function formatShortDate(isoDate) {
  const parts = parseIsoDate(isoDate);
  if (!parts) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(parts);
}

/** Parse YYYY-MM-DD into a Date fixed at UTC midnight, or null if malformed. */
function parseIsoDate(isoDate) {
  if (typeof isoDate !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

/** How many days back an entry is, relative to a YYYY-MM-DD reference date. */
export function daysBetween(isoStart, isoEnd) {
  const start = parseIsoDate(isoStart);
  const end = parseIsoDate(isoEnd);
  if (!start || !end) return Number.POSITIVE_INFINITY;
  return Math.round((end - start) / 86400000);
}

/**
 * Escape text for safe interpolation into HTML.
 *
 * Everything on this site comes from Notion, which is trusted, but entries
 * routinely contain & and < in figures such as "S&P 500" and comparisons.
 * Escaping at the boundary keeps the output valid rather than merely safe.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build a URL safe slug from a headline.
 *
 * Diacritics are stripped rather than dropped so that a headline containing
 * an accented name still produces readable characters instead of gaps.
 */
export function slugify(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/**
 * A small, stable, non cryptographic hash. This is the FNV-1a algorithm.
 *
 * It exists so that visual choices can be derived from an entry's date. The
 * important property is not distribution quality but determinism. An entry
 * published in August must still look identical when the site is rebuilt in
 * December, so Math.random is never used anywhere in this project.
 */
export function stableHash(text) {
  let hash = 0x811c9dc5;
  const input = String(text ?? '');
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Coerce to an unsigned 32 bit integer so callers always get a positive
  // number to take a modulo of.
  return hash >>> 0;
}
