/**
 * A small static file server for previewing the built site.
 *
 * This exists so that `npm run preview` works without pulling in a package.
 * It is a development tool only. GitHub Pages does the serving in production,
 * so nothing here needs to be robust against hostile input.
 *
 * Opening dist/index.html directly from the filesystem does not work, because
 * the pages link to absolute paths such as /assets/styles.css and a file URL
 * would resolve those against the root of the disk. Serving over HTTP is what
 * makes the preview match what GitHub Pages will do.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const ROOT = process.argv[2] ?? 'dist';
const PORT = Number(process.env.PORT ?? 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer(async (request, response) => {
  // Strip the query string and refuse any path that tries to climb out of
  // the output directory.
  const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const safe = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  let target = join(ROOT, safe);

  try {
    // A directory means the index inside it, which is how the clean URLs
    // such as /glossary/ are meant to resolve.
    if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
  } catch {
    // Falls through to the 404 below.
  }

  try {
    const body = await readFile(target);
    response.writeHead(200, {
      'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    // Serve the real 404 page so it can be previewed too.
    try {
      const notFound = await readFile(join(ROOT, '404.html'));
      response.writeHead(404, { 'Content-Type': TYPES['.html'] });
      response.end(notFound);
    } catch {
      response.writeHead(404, { 'Content-Type': TYPES['.txt'] });
      response.end('Not found\n');
    }
  }
});

server.listen(PORT, () => {
  console.log(`\n  The Money Edit preview\n  http://localhost:${PORT}\n\n  Press Control C to stop.\n`);
});
