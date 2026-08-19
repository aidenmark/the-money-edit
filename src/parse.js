/**
 * Turn a Notion page body into the structured shape the card template needs.
 *
 * The entries in the database were not all written to the same format. The
 * scheduled task that files them evolved, so three shapes exist in the wild:
 *
 *   structured  Five "## " sections. What happened, Why it happened, What it
 *               means for you, Key figures as a bullet list, Source. This is
 *               the canonical format and the one to write going forward.
 *   loose       Free paragraphs, a middot separated figures line, a
 *               "Term of the day." paragraph, and an inline source link.
 *   empty       Properties only, no page body at all.
 *
 * Rather than pick one and break the others, the parser reads whatever is
 * there and reports which shape it found. Older entries keep rendering, newer
 * entries render richer, and nothing needs backfilling by hand.
 */

import { escapeHtml, slugify } from './util.js';
import { plainText, firstLink } from './notion.js';

/** Section headings the card renders in a fixed order, whatever Notion says. */
const SECTION_ORDER = ['what-happened', 'why-it-happened', 'what-it-means'];

/** Map a heading, however it was worded that day, onto a stable section key. */
const SECTION_ALIASES = [
  [/what\s+happened/i, 'what-happened'],
  [/why\s+(it\s+)?happened|why\s+this\s+matters/i, 'why-it-happened'],
  [/what\s+it\s+means|for\s+your?\s+money/i, 'what-it-means'],
  [/key\s+(figures|numbers)|the\s+numbers/i, 'figures'],
  [/source|read\s+more/i, 'source'],
  [/term\s+of\s+the\s+day|glossary/i, 'term'],
];

/** Human labels for the sections the card shows. */
export const SECTION_LABELS = {
  'what-happened': 'What happened',
  'why-it-happened': 'Why it happened',
  'what-it-means': 'What it means for you',
};

/**
 * Words that trail a label and really belong to the value.
 *
 * Two problems, one list. "30-year Treasury above 5.3%" would otherwise label
 * a tile "30-year Treasury above", which reads badly. And "S&P 500 down 0.29%"
 * would label it "S&P 500 down" with a value of "0.29%", which is worse than
 * ugly: the direction word never reaches the value, so the tile shows no arrow
 * and no tint, and the reader loses the fact that the number fell.
 *
 * Moving the word onto the value fixes both. Direction is then detected from
 * the value, and the leading word is dropped once the arrow carries it.
 */
const TRAILING_QUALIFIERS =
  /\s+(about|roughly|around|approximately|above|below|near|over|under|at|to|down|up|lower|higher|fell|rose|climbed|gained|slipped|dropped)$/i;

/**
 * A token that looks like a reported value rather than part of a name.
 * "S&P 500" contains a number but "7,750.48" and "0.45%" are the real values,
 * so the pattern deliberately requires a decimal, a thousands comma, a percent
 * sign, or a currency prefix.
 */
const VALUE_TOKEN = /^[$+-]?(?:\d{1,3}(?:,\d{3})+|\d+\.\d+|\d+%|\$\d)/;

/**
 * A direction word at the very start of a value. Only a leading word is
 * removed, so "$85.67 a barrel, up 1.4%" keeps its wording intact.
 */
const LEADING_DIRECTION_WORD =
  /^(down|up|fell|rose|climbed|gained|slipped|dropped|declined|lower|higher|surged|jumped)\s+/i;

/** Classify a figure so the card can tint it. */
function directionOf(text) {
  if (/\b(down|fell|slid|slipped|lower|dropped|declin)/i.test(text)) return 'down';
  if (/\b(up|rose|climbed|gained|higher|surged|jumped)/i.test(text)) return 'up';
  if (/^-|\(-/.test(text.trim())) return 'down';
  if (/^\+/.test(text.trim())) return 'up';
  return 'flat';
}

/**
 * Split one figure into a label and a value.
 *
 * A colon is the unambiguous separator and is used when present. Otherwise the
 * split falls at the first token that looks like a value, which handles the
 * middot separated line in the loose format.
 */
export function parseFigure(raw) {
  const text = String(raw ?? '').replace(/\\\$/g, '$').trim();
  if (!text) return null;

  let label;
  let value;

  const colon = text.indexOf(':');
  if (colon > 0 && colon < 40) {
    label = text.slice(0, colon).trim();
    value = text.slice(colon + 1).trim();
  } else {
    const words = text.split(/\s+/);
    const splitAt = words.findIndex((word) => VALUE_TOKEN.test(word));
    if (splitAt <= 0) return { label: text, value: '', direction: 'flat' };
    label = words.slice(0, splitAt).join(' ');
    value = words.slice(splitAt).join(' ');
  }

  // Push a trailing qualifier out of the label and back onto the value.
  const qualifier = TRAILING_QUALIFIERS.exec(label);
  if (qualifier) {
    label = label.slice(0, qualifier.index).trim();
    value = `${qualifier[0].trim()} ${value}`.trim();
  }

  if (!label) return null;

  const direction = directionOf(value || label);

  // The tile prefixes an arrow for anything that moved, so a value that also
  // opens with the word would render as "arrow down 0.5%". Drop the word and
  // keep the arrow, which reads as an instrument rather than as a duplicate.
  if (direction !== 'flat') {
    value = value.replace(LEADING_DIRECTION_WORD, '');
  }

  return { label, value, direction };
}

/**
 * Recognise the middot separated figures line used by the loose format, for
 * example "Dow 53,483 down 0.46% · S&P 500 7,750.48 down 0.45%".
 *
 * Two segments are required so that an ordinary sentence containing a stray
 * middot is not mistaken for a data line.
 */
function parseFiguresLine(text) {
  if (!text.includes('·')) return null;
  const segments = text
    .split('·')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return null;
  const figures = segments.map(parseFigure).filter(Boolean);
  return figures.length >= 2 ? figures : null;
}

/**
 * Pull a term and its definition out of a "Term of the day" paragraph.
 *
 * Two phrasings are supported. An explicit "Term of the day: basis point."
 * names the term outright. The looser "Term of the day. A basis point is ..."
 * requires inferring the name from the opening clause of the definition,
 * which is why the "A <term> is" pattern is matched.
 */
export function parseTerm(text) {
  const stripped = String(text ?? '')
    .replace(/^\**\s*term\s+of\s+the\s+day\s*\**\s*[.:]?\s*/i, '')
    .trim();
  if (!stripped) return null;

  // "Term of the day: basis point. A basis point is ..."
  const explicit = /^([^.:]{2,40})[.:]\s+(.+)$/s.exec(stripped);
  if (explicit && !/\bis\b|\bmeans\b|\brefers\b/i.test(explicit[1])) {
    return { term: explicit[1].trim(), definition: explicit[2].trim() };
  }

  // "A basis point is one hundredth of a percentage point."
  const inferred = /^(?:an?|the)\s+([^,.]{2,40}?)\s+(?:is|are|means|refers)\b/i.exec(
    stripped
  );
  if (inferred) {
    return { term: inferred[1].trim(), definition: stripped };
  }

  return { term: stripped.split(/\s+/).slice(0, 3).join(' '), definition: stripped };
}

/**
 * Render one Notion rich text array as inline HTML.
 *
 * Only the marks that actually appear in these entries are supported. Adding
 * more later is a matter of extending this function, and keeping it small
 * means the generated markup stays predictable.
 */
export function richTextToHtml(richText = []) {
  return richText
    .map((piece) => {
      const annotations = piece?.annotations ?? {};
      let html = escapeHtml(piece?.plain_text ?? '');
      if (!html) return '';
      if (annotations.code) html = `<code>${html}</code>`;
      if (annotations.bold) html = `<strong>${html}</strong>`;
      if (annotations.italic) html = `<em>${html}</em>`;
      const href = piece?.href ?? piece?.text?.link?.url;
      if (href) {
        html = `<a href="${escapeHtml(href)}" rel="noopener noreferrer nofollow" target="_blank">${html}</a>`;
      }
      return html;
    })
    .join('');
}

/** Resolve a heading string onto a section key, or null if unrecognised. */
function sectionKeyFor(heading) {
  for (const [pattern, key] of SECTION_ALIASES) {
    if (pattern.test(heading)) return key;
  }
  return slugify(heading) || null;
}

/**
 * Parse a full entry. Returns the entry with the parsed body merged in.
 *
 * The parser is a single pass over the block list holding one piece of state,
 * the section currently being filled. Every block either changes that state,
 * when it is a heading, or contributes content to it.
 */
export function parseEntry(entry) {
  const blocks = entry.blocks ?? [];

  const prose = new Map();
  const figures = [];
  let term = null;
  let source = null;
  let sawHeading = false;
  let current = 'what-happened';

  const addProse = (key, html) => {
    if (!html) return;
    if (!prose.has(key)) prose.set(key, []);
    prose.get(key).push(html);
  };

  for (const block of blocks) {
    const type = block?.type;
    const richText = block?.[type]?.rich_text ?? [];
    const text = plainText(richText).trim();

    if (type === 'heading_1' || type === 'heading_2' || type === 'heading_3') {
      sawHeading = true;
      current = sectionKeyFor(text) ?? current;
      continue;
    }

    if (!text) continue;

    // A bullet inside the figures section is a figure. Anywhere else it is
    // ordinary prose and is kept as a list item.
    if (type === 'bulleted_list_item' || type === 'numbered_list_item') {
      if (current === 'figures') {
        const figure = parseFigure(text);
        if (figure) figures.push(figure);
      } else {
        addProse(current, `<li>${richTextToHtml(richText)}</li>`);
      }
      continue;
    }

    if (type !== 'paragraph' && type !== 'quote' && type !== 'callout') continue;

    // A "Term of the day" paragraph can appear with or without a heading.
    if (/^\**\s*term\s+of\s+the\s+day/i.test(text) || current === 'term') {
      term = parseTerm(text) ?? term;
      continue;
    }

    // The source is either a link paragraph under a Source heading, or a
    // paragraph that names itself as the source inline.
    const href = firstLink(richText);
    if (href && (current === 'source' || /^\s*\(?source\b/i.test(text))) {
      source = {
        url: href,
        title: text.replace(/^\s*\(?source\s*[:\-–]?\s*/i, '').replace(/\)$/, '').trim(),
      };
      continue;
    }

    // An unlabelled middot line is the loose format's figures row.
    const inlineFigures = parseFiguresLine(text);
    if (inlineFigures) {
      figures.push(...inlineFigures);
      continue;
    }

    if (current === 'figures') {
      const figure = parseFigure(text);
      if (figure) figures.push(figure);
      continue;
    }

    if (current === 'source') {
      if (href) source = { url: href, title: text };
      continue;
    }

    addProse(current, `<p>${richTextToHtml(richText)}</p>`);
  }

  // A structured entry names its sections. A loose one does not, so its prose
  // all lands under what-happened, which is the correct place for it.
  const bodyFormat = blocks.length === 0 ? 'empty' : sawHeading ? 'structured' : 'loose';

  // If the body carried no prose at all, fall back to the Content property so
  // that even a blank page still renders a readable card.
  if (prose.size === 0 && entry.summary) {
    addProse('what-happened', `<p>${escapeHtml(entry.summary)}</p>`);
  }

  const sections = SECTION_ORDER.filter((key) => prose.has(key)).map((key) => ({
    key,
    label: SECTION_LABELS[key],
    html: joinProse(prose.get(key)),
  }));

  // Anything under a heading the parser did not recognise is still shown,
  // after the known sections, so no writing is ever silently dropped.
  for (const [key, parts] of prose) {
    if (SECTION_ORDER.includes(key)) continue;
    if (key === 'figures' || key === 'source' || key === 'term') continue;
    sections.push({ key, label: titleCase(key), html: joinProse(parts) });
  }

  return { ...entry, sections, figures, term, source, bodyFormat };
}

/** Wrap consecutive list items in a single ul, leaving paragraphs alone. */
function joinProse(parts = []) {
  const out = [];
  let openList = false;
  for (const part of parts) {
    const isItem = part.startsWith('<li>');
    if (isItem && !openList) {
      out.push('<ul>');
      openList = true;
    } else if (!isItem && openList) {
      out.push('</ul>');
      openList = false;
    }
    out.push(part);
  }
  if (openList) out.push('</ul>');
  return out.join('\n');
}

/** "what-happened" becomes "What happened". Used for unrecognised headings. */
function titleCase(key) {
  const words = String(key).replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
