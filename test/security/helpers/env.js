/**
 * Environment isolation for the security suite.
 *
 * Every test must pass an explicit temp `PROFESSOR_HOME`. `isolateEnv` snapshots the environment
 * once, removes ambient API keys / home overrides / every `PROFESSOR_*` and `STUDIO_*` key, then
 * applies the test's overrides. `restoreEnv` deletes anything the test added and restores the exact
 * snapshot, so no real-home or API-key state leaks between tests.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const EXPLICIT_KEYS = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_API_KEY',
  'OPENAI_API_KEY',
  'COURSES_DIR',
  'STUDIO_DB',
  'STUDIO_DIST',
  'OLLAMA_HOST',
  'PROFESSOR_HOME',
  'NODE_ENV',
];

const ISOLATED_PREFIXES = ['PROFESSOR_', 'STUDIO_'];

let saved = null;
let currentHome = null;

function shouldDrop(key) {
  return EXPLICIT_KEYS.includes(key) || ISOLATED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Delete ambient isolated keys, then apply `overrides` (`undefined` removes a key).
 * @param {Record<string, string|undefined>} [overrides]
 * @returns {NodeJS.ProcessEnv}
 */
export function isolateEnv(overrides = {}) {
  if (saved === null) saved = { ...process.env };

  for (const key of Object.keys(process.env)) {
    if (shouldDrop(key)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  return process.env;
}

/**
 * Create a temp `PROFESSOR_HOME`, isolate the environment and point it at that home.
 * @param {Record<string, string|undefined>} [overrides]
 * @returns {string} the temp home
 */
export function withTempProfessorHome(overrides = {}) {
  const home = mkdtempSync(join(tmpdir(), 'professor-security-'));
  currentHome = home;
  isolateEnv({ PROFESSOR_HOME: home, ...overrides });
  return home;
}

/**
 * Restore the exact environment snapshot and forget it (idempotent).
 */
export function restoreEnv() {
  if (saved === null) {
    for (const key of Object.keys(process.env)) {
      if (shouldDrop(key)) delete process.env[key];
    }
    return;
  }

  for (const key of Object.keys(process.env)) {
    if (!(key in saved)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(saved)) {
    process.env[key] = value;
  }
  saved = null;
}

/**
 * Remove the most recently created temp home (best effort). Tests can also remove their own.
 */
export function cleanupTempHome() {
  if (!currentHome) return;
  try {
    rmSync(currentHome, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  currentHome = null;
}
