/**
 * static-server — the tiny `node:http` server `course-professor studio` uses to serve the built
 * Studio SPA (`studio/dist`) on its own port. No dependencies, no directory listing, loopback
 * only, and an `index.html` fallback so deep links keep working (Studio uses hash routing, so in
 * practice the server only ever sees `/` and hashed assets).
 */
import { createServer } from 'http';
import { createReadStream, existsSync, statSync } from 'fs';
import { extname, join, resolve, sep } from 'path';

/** @type {Record<string,string>} */
export const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
};

/**
 * @param {string} filePath
 * @returns {string} MIME type (defaults to octet-stream)
 */
export function contentTypeFor(filePath) {
  return MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * Map a request URL path to a file inside `root`, refusing anything that escapes it.
 * @param {string} root absolute directory
 * @param {string} urlPath decoded pathname
 * @returns {string|null} absolute file path, or null on traversal
 */
export function resolveStaticPath(root, urlPath) {
  const clean = String(urlPath || '/').split('?')[0].split('#')[0];
  const relative = clean.replace(/^\/+/, '');
  const candidate = resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  return candidate;
}

/**
 * Build the request handler.
 * @param {{ root: string, spaFallback?: boolean, log?: (...a:any[])=>void }} opts
 */
export function createStaticHandler({ root, spaFallback = true, log = () => {} }) {
  const absoluteRoot = resolve(root);
  const indexPath = join(absoluteRoot, 'index.html');

  return function handle(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    let filePath = resolveStaticPath(absoluteRoot, pathname);
    if (filePath && filePath.endsWith(sep)) filePath = join(filePath, 'index.html');

    if (filePath && existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html');
    }

    // SPA fallback: extension-less routes are client-side; serve index.html.
    const hasExtension = extname(pathname) !== '';
    if ((!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) && spaFallback && !hasExtension) {
      filePath = indexPath;
    }

    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const stat = statSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentTypeFor(filePath),
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(filePath);
    stream.on('error', (err) => {
      log(`static-server: read failed for ${filePath}: ${err.message}`);
      if (!res.headersSent) res.writeHead(500);
      res.end('Internal Server Error');
    });
    stream.pipe(res);
  };
}

/**
 * @param {{ root: string, spaFallback?: boolean, log?: (...a:any[])=>void }} opts
 * @returns {import('http').Server}
 */
export function createStaticServer(opts) {
  return createServer(createStaticHandler(opts));
}

/**
 * Start serving `root` and resolve once listening.
 * @param {{ root: string, port?: number, host?: string, spaFallback?: boolean, log?: (...a:any[])=>void }} opts
 * @returns {Promise<{ server: import('http').Server, url: string, port: number, close: () => Promise<void> }>}
 */
export async function startStaticServer({ root, port = 5180, host = '127.0.0.1', ...rest } = {}) {
  const server = createStaticServer({ root, ...rest });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolveListen();
    });
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return {
    server,
    port: actualPort,
    url: `http://localhost:${actualPort}`,
    close: () => new Promise((done) => server.close(() => done())),
  };
}
