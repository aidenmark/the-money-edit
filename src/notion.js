/**
 * The only module in this project that knows Notion exists.
 *
 * Everything downstream works with plain objects shaped like this:
 *
 *   { id, date, headline, summary, status, blocks: [...] }
 *
 * That boundary is deliberate. If the source of truth ever moves off Notion,
 * this one file gets rewritten and nothing else changes.
 *
 * There is no SDK here on purpose. Node 18 ships fetch, the Notion REST API
 * is three endpoints, and calling it directly keeps the project at zero
 * runtime dependencies while making the actual HTTP exchange visible.
 */

const API_ROOT = 'https://api.notion.com/v1';

/**
 * Notion is migrating databases to a data sources model. The 2025-09-03 API
 * queries a data source, while the older 2022-06-28 API queries a database.
 * Both IDs are known, so the client tries the newer endpoint first and falls
 * back once if the workspace has not been migrated. Keeping both paths costs
 * a few lines and removes a whole class of confusing empty result.
 */
const API_VERSIONS = [
  {
    version: '2025-09-03',
    path: (ids) => `/data_sources/${ids.dataSourceId}/query`,
  },
  {
    version: '2022-06-28',
    path: (ids) => `/databases/${ids.databaseId}/query`,
  },
];

/** Identifiers for the Money Edit database, taken from its Notion URL. */
export const MONEY_EDIT_IDS = {
  dataSourceId: 'dc879ea9-06ea-4191-a7b3-39c7ff20016d',
  databaseId: 'cdba537d-c018-4e3d-ba71-c9ae6f892795',
};

/** Perform one authenticated call against the Notion API. */
async function request(token, apiVersion, path, body) {
  const response = await fetch(`${API_ROOT}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': apiVersion,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(
      `Notion API returned ${response.status} for ${path}. ${detail}`
    );
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/**
 * Read every row of the database, following pagination until Notion says
 * there are no more pages. The result is unfiltered on purpose. Deciding
 * what is publishable is a policy question and it belongs in build.js, not
 * in the transport layer.
 */
export async function fetchAllRows(token, ids = MONEY_EDIT_IDS) {
  let lastError;

  for (const api of API_VERSIONS) {
    try {
      const rows = [];
      let cursor;

      do {
        const page = await request(token, api.version, api.path(ids), {
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        });
        rows.push(...page.results);
        cursor = page.has_more ? page.next_cursor : undefined;
      } while (cursor);

      return { rows, apiVersion: api.version };
    } catch (error) {
      // A 404 means this endpoint shape does not exist for this workspace,
      // so the other API version is worth trying. Anything else is a real
      // failure such as a bad token, and retrying would only hide it.
      if (error.status !== 404) throw error;
      lastError = error;
    }
  }

  throw lastError;
}

/**
 * Fetch the body of one entry page.
 *
 * Notion keeps page properties and page content in separate places, so the
 * writeup, the key figures, and the source link all require a second call
 * per entry. Nested children are not requested because the entry format is
 * flat by design.
 */
export async function fetchPageBlocks(token, apiVersion, pageId) {
  const blocks = [];
  let cursor;

  do {
    const query = new URLSearchParams({ page_size: '100' });
    if (cursor) query.set('start_cursor', cursor);
    const page = await request(
      token,
      apiVersion,
      `/blocks/${pageId}/children?${query}`
    );
    blocks.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);

  return blocks;
}

/**
 * Flatten Notion's rich text array into a plain string.
 *
 * Notion splits a sentence into several rich text objects wherever formatting
 * changes, so "**Term of the day.** A basis point is" arrives as two pieces.
 * Callers that need to detect such a prefix need the whole sentence, which is
 * why this concatenates rather than preserving the pieces.
 */
export function plainText(richText = []) {
  return richText.map((piece) => piece?.plain_text ?? '').join('');
}

/**
 * Pull the first link out of a rich text array, checking both the inline link
 * form and the href Notion sets on the piece itself.
 */
export function firstLink(richText = []) {
  for (const piece of richText) {
    const href = piece?.href ?? piece?.text?.link?.url;
    if (href) return href;
  }
  return null;
}

/**
 * Convert one Notion row into the plain shape the rest of the build uses.
 *
 * Missing properties resolve to empty values rather than throwing. An entry
 * mid edit in Notion should never break the whole build.
 */
export function normalizeRow(row) {
  const props = row.properties ?? {};
  return {
    id: row.id,
    notionUrl: row.url ?? null,
    headline: plainText(props.Headline?.title),
    summary: plainText(props.Content?.rich_text),
    date: props.Date?.date?.start?.slice(0, 10) ?? null,
    status: props.Status?.select?.name ?? null,
    // Set from the Notion Edition property when present. Entries written
    // before the property existed fall back to their creation time.
    edition: props.Edition?.select?.name ?? null,
    createdAt: row.created_time ?? null,
    lastEdited: row.last_edited_time ?? null,
    blocks: [],
  };
}
