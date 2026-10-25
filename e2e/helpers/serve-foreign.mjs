/**
 * Foreign-origin page for the bridge isolation proof (RON-168).
 *
 * Serves one page from a third port. The page exposes `window.callBridge(url, token)` so the spec
 * can issue a real browser fetch from this origin; nothing else is served.
 */
import { createServer } from 'node:http';
import { FOREIGN_ORIGIN, FOREIGN_PORT, HOST } from './env.js';

const HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Foreign origin</title></head>
  <body>
    <h1>Foreign origin</h1>
    <p id="status">Ready</p>
    <script>
      window.callBridge = async function callBridge(url, token) {
        try {
          const headers = token ? { 'X-Studio-Token': token } : {};
          const res = await fetch(url, { headers });
          const body = await res.text();
          return { ok: res.ok, status: res.status, body };
        } catch (err) {
          return { ok: false, error: String(err && err.message ? err.message : err) };
        }
      };
    </script>
  </body>
</html>`;

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(HTML);
});

server.once('error', (err) => {
  console.error(`[e2e foreign] failed to bind ${HOST}:${FOREIGN_PORT}: ${err.message}`);
  process.exit(1);
});

server.listen(FOREIGN_PORT, HOST, () => {
  console.log(`[e2e foreign] serving at ${FOREIGN_ORIGIN}`);
});
