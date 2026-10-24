import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The ONE app version (Phase 7 D-03): the root `package.json` version, never studio/package.json's
 * stale `0.1.0` (D-05). `import.meta.url` is the real config path under `vite build` and Vitest, so
 * `../package.json` resolves to the repository root in every runner (verified).
 * @type {{ __APP_VERSION__: string }}
 */
export const APP_VERSION_DEFINE = {
  __APP_VERSION__: JSON.stringify(
    JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  ),
};

/**
 * Relax the CSP meta for the dev server only: React refresh injects an inline preamble and Vite HMR
 * needs a WebSocket. The strict meta in index.html stays the production contract.
 * @param {string} html
 * @returns {string}
 */
export function relaxCspForDev(html) {
  return String(html)
    .replace(/(<meta http-equiv="Content-Security-Policy" content=")/, '$1')
    .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
    .replace("connect-src 'self' ", "connect-src 'self' ws://localhost:* ws://127.0.0.1:* ");
}

// Static SPA: builds to dist/ and runs on any static host (void.cloud, Cloudflare Pages, Netlify…).
// Hash routing is used so no server-side rewrite rules are needed.
export default defineConfig({
  define: APP_VERSION_DEFINE,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'studio-dev-csp',
      apply: 'serve',
      transformIndexHtml(html) {
        return relaxCspForDev(html);
      },
    },
  ],
  base: './',
  server: { port: 5180, host: true },
  test: { environment: 'node', include: ['test/**/*.test.js'] },
});
