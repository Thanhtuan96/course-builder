import { defineConfig } from 'void/config';

// Void reads void.config.ts from the project root. This deploys the pre-built Studio SPA
// (studio/dist) to void.cloud / your own Cloudflare account. Build it first with
// `npm run build:studio` (or `void deploy` will run studio's build). See studio/docs/DEPLOY.md.
export default defineConfig({
  inference: {
    appType: 'spa', // static output + SPA fallback to index.html (200) for unknown paths
    outputDir: 'studio/dist',
  },
  cloudflare: {
    name: 'professor-studio',
  },
});
