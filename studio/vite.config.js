import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
