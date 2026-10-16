import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Static SPA: builds to dist/ and runs on any static host (void.cloud, Cloudflare Pages, Netlify…).
// Hash routing is used so no server-side rewrite rules are needed.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: { port: 5180, host: true },
  test: { environment: 'node', include: ['test/**/*.test.js'] },
});
