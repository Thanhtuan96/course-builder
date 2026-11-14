/**
 * Background state for `skillforce studio` (RON-297): the `studio.json` snapshot that `--status`
 * and `--stop` read, plus the two probes they need (pid liveness, one-shot health check).
 *
 * Nothing here writes during a read path: `writeState` is only called by a running server, and
 * `readState`/`probeStudioHealth` never create a file or a token.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

export const STATE_FILE = 'studio.json';
export const LOG_FILE = 'studio.log';

/**
 * Resolve `${PROFESSOR_HOME:-~/.professor}` without consulting the real home when one is supplied.
 * @param {{ env?: Record<string,string|undefined>, home?: string }} [opts]
 * @returns {string}
 */
export function professorHome({ env = process.env, home } = {}) {
  return home || env.PROFESSOR_HOME || join(homedir(), '.professor');
}

/**
 * Absolute path of the background state file.
 * @param {{ env?: Record<string,string|undefined>, home?: string }} [opts]
 * @returns {string}
 */
export function stateFilePath({ env = process.env, home } = {}) {
  return join(professorHome({ env, home }), STATE_FILE);
}

/**
 * Absolute path of the background log file used by the LaunchAgent.
 * @param {{ env?: Record<string,string|undefined>, home?: string }} [opts]
 * @returns {string}
 */
export function logFilePath({ env = process.env, home } = {}) {
  return join(professorHome({ env, home }), 'logs', LOG_FILE);
}

/** True for the payload Studio's `/api/studio/health` returns; anything else is a foreign app. */
export function isStudioHealthPayload(body) {
  return Boolean(body) && body.ok === true && typeof body.version === 'string';
}

/** A recorded state is usable only with a numeric pid; anything else is treated as absent. */
function isStateShape(value) {
  return Boolean(value) && typeof value === 'object' && Number.isInteger(value.pid);
}

/**
 * Write the state file atomically (temp file + rename, mode `0600`).
 * @param {{ pid: number, port: number, apiPort: number, studioUrl: string, apiUrl: string,
 *           startedAt: string }} state
 * @param {{ env?: Record<string,string|undefined>, home?: string }} [opts]
 * @returns {string} the file path
 */
export function writeState(state, { env = process.env, home } = {}) {
  const file = stateFilePath({ env, home });
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, file);
  } catch (err) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    throw err;
  }
  return file;
}

/**
 * Read the state file. A missing, malformed or truncated file reads as `null`.
 * @param {{ env?: Record<string,string|undefined>, home?: string }} [opts]
 * @returns {{ pid: number, port: number, apiPort: number, studioUrl: string, apiUrl: string,
 *             startedAt: string } | null}
 */
export function readState({ env = process.env, home } = {}) {
  try {
    const parsed = JSON.parse(readFileSync(stateFilePath({ env, home }), 'utf-8'));
    return isStateShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Remove the state file; missing is not an error.
 * @param {{ env?: Record<string,string|undefined>, home?: string }} [opts]
 * @returns {boolean} true when a file was removed
 */
export function removeState({ env = process.env, home } = {}) {
  try {
    rmSync(stateFilePath({ env, home }), { force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * True when the pid exists. `EPERM` counts as alive: the process exists but is not ours.
 * @param {number} pid
 * @param {{ kill?: (pid: number, signal?: number) => void }} [opts]
 * @returns {boolean}
 */
export function isPidAlive(pid, { kill = process.kill } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

/**
 * A timeout signal when the runtime has one; `undefined` keeps the probe working on older Nodes.
 */
function abortTimeout(ms) {
  try {
    return typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * One `GET /api/studio/health` against the loopback bridge. Any answer that is not a Studio health
 * payload (404, foreign JSON, timeout, refused connection) is `false`; it never throws.
 *
 * @param {{ apiUrl: string, token?: string|null, fetchImpl?: typeof fetch,
 *           timeoutMs?: number }} opts
 * @returns {Promise<boolean>}
 */
export async function probeStudioHealth({
  apiUrl,
  token,
  fetchImpl = globalThis.fetch,
  timeoutMs = 1500,
} = {}) {
  const headers = token ? { 'X-Studio-Token': token } : {};
  try {
    const res = await fetchImpl(`${apiUrl}/api/studio/health`, {
      headers,
      signal: abortTimeout(timeoutMs),
    });
    if (!res || !res.ok) return false;
    const body = await res.json().catch(() => null);
    return isStudioHealthPayload(body);
  } catch {
    return false;
  }
}
