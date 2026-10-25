/**
 * Static Studio server for the E2E Studio origin (RON-168).
 *
 * Uses the same `bin/static-server.js` handler as `course-professor studio`, so the suite tests the
 * shipped static behaviour (SPA fallback, MIME types, no directory listing) and not `vite dev`.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { startStaticServer } from '../../bin/static-server.js';
import { HOST, STUDIO_DIST, STUDIO_PORT } from './env.js';

const indexHtml = join(STUDIO_DIST, 'index.html');
if (!existsSync(indexHtml)) {
  console.error(`[e2e] missing ${indexHtml}; run \`npm --prefix studio run build\` first.`);
  process.exit(1);
}

try {
  const { url } = await startStaticServer({
    root: STUDIO_DIST,
    port: STUDIO_PORT,
    host: HOST,
    spaFallback: true,
    log: (line) => console.error(`[e2e studio] ${line}`),
  });
  console.log(`[e2e studio] serving ${STUDIO_DIST} at ${url}`);
} catch (err) {
  console.error(`[e2e studio] failed to bind ${HOST}:${STUDIO_PORT}: ${err.message}`);
  process.exit(1);
}
