import { defineConfig } from 'void/config';

// Deploy the pre-built Studio SPA (studio/dist) to void.cloud (voidzero.dev).
// See docs/DEPLOY.md for the full, verified walkthrough.
export default defineConfig({
  inference: {
    appType: 'spa', // static output + SPA fallback to index.html (200) for unknown paths
    outputDir: 'studio/dist',
  },
  cloudflare: {
    name: 'professor-studio',
  },
});
