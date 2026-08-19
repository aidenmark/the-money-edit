/**
 * Connection check. Run with `npm run check`.
 *
 * Answers the three questions that come up when the pipeline looks broken,
 * in the order they actually fail:
 *
 *   1. Is a token present at all
 *   2. Does Notion accept it
 *   3. Has the database been shared with the integration
 *
 * Question three is the one that catches people out. A token that is valid
 * but not connected to the database returns an empty result set with a 200,
 * which looks exactly like a database with no rows.
 *
 * Nothing here prints the token itself, so the output is safe to share.
 */

import { requireNotionToken, describeToken } from './config.js';
import { fetchAllRows, normalizeRow, MONEY_EDIT_IDS } from './notion.js';

let token;
try {
  token = requireNotionToken();
} catch (error) {
  // A setup problem should read as instructions, not as a crash.
  console.error(error.message);
  process.exit(1);
}
console.log(`Token found: ${describeToken(token)}`);

let result;
try {
  result = await fetchAllRows(token, MONEY_EDIT_IDS);
} catch (error) {
  console.error(`\nNotion rejected the request.\n${error.message}\n`);
  if (error.status === 401) {
    console.error('A 401 means the token is wrong or has been revoked.');
  }
  if (error.status === 404) {
    console.error(
      'A 404 usually means the database has not been shared with the\n' +
        'integration. Open the database in Notion, use the ... menu, choose\n' +
        'Connections, and add your integration.'
    );
  }
  process.exit(1);
}

const entries = result.rows.map(normalizeRow);
console.log(`Notion accepted the token using API version ${result.apiVersion}.`);
console.log(`Rows visible to the integration: ${entries.length}`);

if (entries.length === 0) {
  console.error(
    '\nZero rows came back. The token works but the integration cannot see\n' +
      'the database. In Notion open the database, use the ... menu, choose\n' +
      'Connections, and add the integration.'
  );
  process.exit(1);
}

const published = entries.filter((entry) => entry.status === 'Published');
console.log(`Published: ${published.length}`);
console.log(`Draft: ${entries.filter((e) => e.status === 'Draft').length}`);
console.log('');

for (const entry of entries.sort((a, b) => String(b.date).localeCompare(String(a.date)))) {
  const mark = entry.status === 'Published' ? 'live ' : 'draft';
  console.log(`  ${mark}  ${entry.date ?? 'no date'}  ${entry.headline}`);
}

if (published.length === 0) {
  console.log(
    '\nEverything is still a draft, so the site would build empty.\n' +
      'Flip at least one entry to Published in Notion to see it go live.'
  );
}
