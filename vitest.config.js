// vitest.config.js — scoped to project's own tests only
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    exclude: [
      '**/node_modules/**',
      '**/.claude/**',
      '**/.agents/**',
      '**/bin/**',
      '**/web/**',
      '**/skills/**/*.test.ts',
    ],
    environment: 'node',
  },
});
