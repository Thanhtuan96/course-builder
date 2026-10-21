/**
 * Build a fully isolated legacy-enabled app for the security suite.
 *
 * Each app gets its own temp courses root, Studio/legacy dist and a real SQLite DB under a temp
 * path, so no test can touch the real `~/.professor`, a real legacy client build or a real agent.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { createApp } from '../../../web/server.js';
import { createStudioDb } from '../../../web/studio-db.js';
import { isolateEnv } from './env.js';
import { bootTestServer } from './app.js';

export const LEGACY_TOKEN = 'legacy-token-0123456789abcdef0123456789abcdef';

/** No agent is installed, so a legacy chat request never selects a real provider. */
export const LEGACY_CAPABILITIES = () => ({
  claude: { installed: false },
  cursor: { installed: false },
  opencode: { installed: false },
  gemini: { installed: false },
  antigravity: { installed: false },
  ollama: { installed: false },
});

/** Spawn spy that records calls and returns a no-op child (never a real process). */
export function createSpawnSpy() {
  const spy = (...args) => {
    spy.calls.push(args);
    return {
      on() {},
      kill() {},
      stdout: { on() {} },
      stderr: { on() {} },
    };
  };
  spy.calls = [];
  return spy;
}

/**
 * Write the default course fixture into `coursesDir`.
 * @param {string} coursesDir
 */
export function seedCourses(coursesDir) {
  mkdirSync(join(coursesDir, 'demo', 'exercises'), { recursive: true });
  writeFileSync(join(coursesDir, 'demo', 'COURSE.md'), '# Course: Demo\n\nDemo course intro\n');
  writeFileSync(join(coursesDir, 'demo', 'LECTURE.md'), '# Section 1: Intro\n\nOld lecture\n');
  writeFileSync(join(coursesDir, 'demo', 'NOTES.md'), '# Notes\n');
  writeFileSync(join(coursesDir, 'demo', 'CAPSTONE.md'), '# Capstone\n');
  writeFileSync(join(coursesDir, 'demo', 'exercises', '01-intro.md'), '# Exercise 1\n');

  mkdirSync(join(coursesDir, 'other'), { recursive: true });
  writeFileSync(join(coursesDir, 'other', 'COURSE.md'), '# Course: Other\n\nOther course intro\n');
}

/**
 * @param {object} [options]
 * @param {boolean} [options.legacy]
 * @param {string} [options.nodeEnv]
 * @param {string} [options.token]
 * @param {() => object} [options.capabilities]
 * @param {Record<string, Function>} [options.legacyRunners]
 * @param {Function} [options.spawnImpl]
 * @param {boolean} [options.useCli]
 * @param {object} [options.capabilityCache]
 * @param {(coursesDir: string, legacyDist: string) => void} [options.seed]
 * @returns {Promise<{ app: import('express').Express, db: object, tempDir: string,
 *                     coursesDir: string, legacyDist: string, spawnSpy: Function,
 *                     cleanup: () => void }>}
 */
export async function buildLegacyApp({
  legacy = true,
  nodeEnv = 'production',
  token = LEGACY_TOKEN,
  capabilities = LEGACY_CAPABILITIES,
  legacyRunners,
  spawnImpl,
  useCli = false,
  capabilityCache,
  seed = seedCourses,
} = {}) {
  const tempDir = mkdtempSync(join(tmpdir(), 'professor-legacy-'));
  const coursesDir = join(tempDir, 'courses');
  mkdirSync(coursesDir, { recursive: true });
  seed(coursesDir);

  const studioDist = join(tempDir, 'studio-dist');
  mkdirSync(studioDist, { recursive: true });
  writeFileSync(join(studioDist, 'index.html'), '<!doctype html><title>Studio Dist Marker</title>');

  const legacyDist = join(tempDir, 'legacy-dist');
  mkdirSync(legacyDist, { recursive: true });
  writeFileSync(
    join(legacyDist, 'index.html'),
    '<!doctype html><title>Legacy Dist Marker</title>'
  );

  const dbPath = join(tempDir, 'professor.db');
  isolateEnv({ PROFESSOR_HOME: tempDir, STUDIO_DB: dbPath });

  const db = createStudioDb({ dbPath });
  const spawnSpy = createSpawnSpy();

  const app = await createApp({
    legacy,
    nodeEnv,
    token,
    coursesDir,
    studioDist,
    legacyDist,
    db,
    legacyRunners,
    capabilities,
    capabilityCache,
    useCli,
    spawnImpl: spawnImpl || spawnSpy,
    log: () => {},
  });

  return {
    app,
    db,
    tempDir,
    coursesDir,
    legacyDist,
    spawnSpy,
    cleanup() {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Boot the app on an ephemeral loopback port.
 * @param {import('express').Express} app
 */
export function boot(app) {
  return bootTestServer(app);
}
