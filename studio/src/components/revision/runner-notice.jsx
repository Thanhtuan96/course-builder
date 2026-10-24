/**
 * Run-location acknowledgement helpers (LOOP-04, D-13, D-14).
 *
 * Pure functions only — no React, no JSX and no storage access at module load. The acknowledgement
 * is scoped to `runnerBase(settings)`, so changing the runner URL re-prompts (D-14), and every
 * helper tolerates a missing, blocked or corrupt `localStorage` because the studio renders on the
 * server too (`renderToString` has no `localStorage`).
 *
 * `shouldBlockLocalRun` lives here on purpose: the first-click interception in `CodeWorkspace` is
 * then a unit-tested predicate instead of an untestable inline condition.
 */
import { runnerBase } from '../../lib/runner/index.js';

/** localStorage key holding the acknowledgement record. */
export const RUNNER_ACK_KEY = 'professor.runnerNotice.ack';

/**
 * The current `localStorage`, or `null` when it is unavailable or its getter throws (Safari
 * private mode). Never throws.
 * @returns {Storage|null}
 */
function defaultStorage() {
  try {
    return typeof globalThis !== 'undefined' ? globalThis.localStorage ?? null : null;
  } catch {
    return null;
  }
}

/**
 * The scope an acknowledgement is valid for: the runner API root for the current settings.
 * Returns `null` when the configured runner URL is unusable (a non-loopback bridge throws inside
 * `runnerBase`) — in that case the run fails with `loopback_required` before any code executes, so
 * there is nothing to acknowledge and nothing to persist.
 * @param {object} settings
 * @returns {string|null}
 */
export function runnerAckScope(settings) {
  try {
    return runnerBase(settings);
  } catch {
    return null;
  }
}

/**
 * Read the stored acknowledgement. Malformed JSON, a non-object record or a missing string `url`
 * all collapse to `null`; a throwing storage never propagates.
 * @param {Storage|null} [storage]
 * @returns {{ url: string, acknowledgedAt?: string }|null}
 */
export function readRunnerAck(storage = defaultStorage()) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    const raw = storage.getItem(RUNNER_ACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.url !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Whether the learner still has to acknowledge where their code runs. A different stored `url`
 * re-prompts, and an unusable scope never prompts (D-14).
 * @param {object} settings
 * @param {Storage|null} [storage]
 * @returns {boolean}
 */
export function needsRunnerAck(settings, storage = defaultStorage()) {
  const scope = runnerAckScope(settings);
  if (!scope) return false;
  const ack = readRunnerAck(storage);
  return !ack || ack.url !== scope;
}

/**
 * Persist `{ url, acknowledgedAt }` for the current runner scope and return the record either way:
 * a blocked write must not break the click, and the caller keeps the acknowledgement for the
 * session.
 * @param {object} settings
 * @param {Storage|null} [storage]
 * @param {Date} [now]
 * @returns {{ url: string, acknowledgedAt: string }|null}
 */
export function acknowledgeRunner(settings, storage = defaultStorage(), now = new Date()) {
  const scope = runnerAckScope(settings);
  if (!scope || !storage || typeof storage.setItem !== 'function') return null;
  const record = { url: scope, acknowledgedAt: now.toISOString() };
  try {
    storage.setItem(RUNNER_ACK_KEY, JSON.stringify(record));
  } catch {
    /* storage full or blocked — the acknowledgement still applies to this session */
  }
  return record;
}

/**
 * The pure local-run gate: block only a local runner the learner has not acknowledged. Browser
 * runs, unknown kinds and acknowledged local runs all proceed, and a missing argument object is
 * `false` rather than a throw (D-13).
 * @param {{ runnerKind?: string|null, acknowledged?: boolean }} [input]
 * @returns {boolean}
 */
export function shouldBlockLocalRun({ runnerKind = null, acknowledged = false } = {}) {
  return runnerKind === 'local' && acknowledged !== true;
}
