/**
 * Configuration loading, kept separate so that nothing else in the build has
 * to reason about where a value came from.
 *
 * The token is read from the environment first and from a local .env file
 * second. That ordering is what lets the same build script run unchanged in
 * two places. On a laptop the value comes from .env, and in GitHub Actions it
 * comes from the environment because the workflow maps a repository secret
 * into it. Neither path ever writes the token anywhere.
 */

import { readFileSync } from 'node:fs';

/**
 * Read a .env file into process.env without overwriting anything already set.
 *
 * This is a deliberately small parser rather than a dependency. It supports
 * comments, blank lines, and optional surrounding quotes, which covers every
 * shape a token is ever pasted in.
 */
export function loadEnvFile(path = '.env') {
  let contents;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    // No .env is a normal state in CI, so this is not an error.
    return false;
  }

  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
  return true;
}

/**
 * Return the Notion token, or throw with an instruction rather than a stack
 * trace. A missing token is a setup problem, not a bug, and the message
 * should read like setup instructions.
 */
export function requireNotionToken() {
  loadEnvFile();
  const token = process.env.NOTION_TOKEN?.trim();

  if (!token || token.startsWith('ntn_your_')) {
    throw new Error(
      [
        'NOTION_TOKEN is not set.',
        '',
        'For a local build, put it in .env at the repository root:',
        '  NOTION_TOKEN=ntn_...',
        '',
        'For the scheduled build, set it as a repository secret:',
        '  gh secret set NOTION_TOKEN --repo aidenmark/the-money-edit',
        '',
        'Create the token at https://www.notion.so/my-integrations',
      ].join('\n')
    );
  }
  return token;
}

/**
 * Describe a token without revealing it. Used by the connection check so that
 * output can be pasted into an issue or a screen share safely.
 */
export function describeToken(token) {
  if (!token) return 'missing';
  return `${token.slice(0, 4)}… ${token.length} characters`;
}
