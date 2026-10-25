/**
 * Tiny static server for the evidence fixture (RON-168). Node built-ins only.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number.parseInt(process.env.EVIDENCE_PORT || '3095', 10);
const HOST = '127.0.0.1';
const PAGE = readFileSync(join(HERE, 'index.html'), 'utf8');

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(PAGE);
});

server.once('error', (err) => {
  console.error(`[evidence] failed to bind ${HOST}:${PORT}: ${err.message}`);
  process.exit(1);
});
server.listen(PORT, HOST, () => console.log(`[evidence] http://${HOST}:${PORT}`));
