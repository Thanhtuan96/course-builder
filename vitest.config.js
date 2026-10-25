// vitest.config.js — one run, two projects (root + Studio), no watch, no network.
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));

const SHARED_EXCLUDE = [
  '**/node_modules/**',
  '**/.claude/**',
  '**/.agents/**',
  '**/bin/**',
  '**/web/**',
  '**/skills/**/*.test.ts',
  'e2e/**',
];

const ROOT_DEPENDENCIES = ['express', 'cors'];
const STUDIO_DEPENDENCIES = ['fake-indexeddb/auto'];

/**
 * Check that the installed package roots can satisfy both test projects without
 * installing, building, or fetching anything.
 *
 * @param {object} [opts]
 * @param {string} [opts.rootDir] repository root or a path relative to it
 * @param {string} [opts.studioDir] Studio package root or a path relative to the repository root
 * @returns {void}
 * @throws {Error} with actionable `npm ci` instructions when a dependency is missing
 */
export function assertTestDependencies({
  rootDir = ROOT_DIR,
  studioDir = join(ROOT_DIR, 'studio'),
} = {}) {
  const rootBase = isAbsolute(rootDir) ? rootDir : join(ROOT_DIR, rootDir);
  const studioBase = isAbsolute(studioDir) ? studioDir : join(ROOT_DIR, studioDir);
  const missing = [];

  const rootRequire = createRequire(join(rootBase, 'package.json'));
  for (const dependency of ROOT_DEPENDENCIES) {
    try {
      rootRequire.resolve(dependency);
    } catch {
      missing.push(dependency);
    }
  }

  const studioRequire = createRequire(join(studioBase, 'package.json'));
  for (const dependency of STUDIO_DEPENDENCIES) {
    try {
      studioRequire.resolve(dependency);
    } catch {
      missing.push(`studio:${dependency}`);
    }
  }

  let hasSqlite = false;
  try {
    if (typeof process.getBuiltinModule === 'function') {
      hasSqlite = Boolean(process.getBuiltinModule('node:sqlite'));
    } else {
      rootRequire('node:sqlite');
      hasSqlite = true;
    }
  } catch {
    hasSqlite = false;
  }
  if (!hasSqlite) missing.push('node:sqlite (Node >=22.5)');

  if (missing.length > 0) {
    throw new Error(
      [
        `Missing test dependencies: ${missing.join(', ')}.`,
        'Install the locked trees first:',
        '  npm ci',
        '  npm --prefix web ci',
        '  npm --prefix studio ci',
        'Then re-run `npm test`.',
      ].join('\n')
    );
  }
}

assertTestDependencies();

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'root',
          include: ['test/**/*.test.js'],
          exclude: SHARED_EXCLUDE,
          environment: 'node',
        },
      },
      {
        extends: true,
        root: './studio',
        test: {
          name: 'studio',
          include: ['test/**/*.test.js'],
          environment: 'node',
        },
      },
    ],
  },
});
