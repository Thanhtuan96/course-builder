/**
 * Shared E2E environment: ports, origins, token and temp-home helpers (RON-168).
 *
 * Every value can be overridden by env, but defaults stay inside the reserved test range
 * 3010-3099 so the suite can never touch a developer's servers on 3000/5173/5180.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STUDIO_DIST = join(REPO_ROOT, 'studio', 'dist');
export const AUTH_DIR = join(REPO_ROOT, 'e2e', '.auth');
export const PAIRING_STATE = join(AUTH_DIR, 'paired.json');
export const TEST_RESULTS_DIR = join(REPO_ROOT, 'test-results');
export const PROFESSOR_HOME_MARKER = join(AUTH_DIR, 'professor-home.txt');
export const FAKE_AGENT_DIR = join(REPO_ROOT, 'e2e', 'fixtures', 'fake-agent');
export const EVIDENCE_FIXTURE = join(REPO_ROOT, 'e2e', 'fixtures', 'evidence', 'chromium-green.json');
export const EVIDENCE_SPEC = join(REPO_ROOT, 'e2e', 'fixtures', 'evidence', 'workflow.spec.js');

export const MIN_PORT = 3010;
export const MAX_PORT = 3099;

/** Fixed, in-process-only token. It is never written to a user file or printed. */
export const BRIDGE_TOKEN = 'ron-168-e2e-token-4c1f9a2e';

export const STUDIO_PORT = readPort('E2E_STUDIO_PORT', 3040);
export const BRIDGE_PORT = readPort('E2E_BRIDGE_PORT', 3041);
export const FOREIGN_PORT = readPort('E2E_FOREIGN_PORT', 3042);

export const HOST = '127.0.0.1';
export const STUDIO_ORIGIN = `http://${HOST}:${STUDIO_PORT}`;
export const BRIDGE_ORIGIN = `http://${HOST}:${BRIDGE_PORT}`;
export const FOREIGN_ORIGIN = `http://${HOST}:${FOREIGN_PORT}`;
export const BRIDGE_HEALTH_URL = `${BRIDGE_ORIGIN}/api/studio/health`;
export const STUDIO_ORIGINS = STUDIO_ORIGIN;

export const PAIRING_URL =
  `${STUDIO_ORIGIN}/#/settings?bridge=${encodeURIComponent(BRIDGE_ORIGIN)}` +
  `&token=${encodeURIComponent(BRIDGE_TOKEN)}`;

/**
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
function readPort(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || String(value) !== String(raw).trim()) {
    throw new Error(`${name} must be an integer port, got ${raw}`);
  }
  assertTestPort(value, name);
  return value;
}

/**
 * @param {number} port
 * @param {string} [name]
 */
export function assertTestPort(port, name = 'port') {
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(`${name} must be inside ${MIN_PORT}-${MAX_PORT}, got ${port}`);
  }
}

/** Fresh temp PROFESSOR_HOME for one bridge process. */
export function createTempHome() {
  return mkdtempSync(join(tmpdir(), 'professor-e2e-'));
}

/** @param {string} dir */
export function removeTempHome(dir) {
  if (!dir) return;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}
