/**
 * select-adapter — auto-detect the storage backend (DATA-04).
 *
 * If Settings has a bridge URL + pairing token AND the local server answers `/db/health`, Studio
 * stores data in SQLite via the remote adapter. Otherwise it falls back to IndexedDB (the default,
 * and the only option on a static deploy with no local server).
 *
 * Deliberately free of React imports so the same code runs in tests/Node; Settings are read from
 * localStorage directly when not passed in.
 */
import { useAdapter } from './index.js';
import { createIdbAdapter } from './idb-adapter.js';
import { createRemoteAdapter } from './remote-adapter.js';

export const SETTINGS_KEY = 'professor-studio:settings';
const PROBE_TIMEOUT_MS = 1500;

/** @returns {object} the stored settings object, or {} when unavailable. */
export function readStoredSettings() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** @param {object} [settings] */
export function bridgeConfigFrom(settings = readStoredSettings()) {
  const bridge = settings.bridge || {};
  return {
    bridgeUrl: bridge.bridgeUrl || settings.bridgeUrl || '',
    bridgeToken: bridge.bridgeToken || settings.bridgeToken || '',
    agent: bridge.agent || '',
  };
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/**
 * Probe the configured bridge and pick an adapter.
 * @param {{ settings?: object, timeoutMs?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{ adapter: import('./remote-adapter.js').StorageAdapter, kind: 'remote'|'indexeddb', health?: object }>}
 */
export async function selectAdapter({ settings, timeoutMs = PROBE_TIMEOUT_MS, fetchImpl } = {}) {
  const cfg = bridgeConfigFrom(settings || readStoredSettings());
  if (cfg.bridgeUrl && cfg.bridgeToken) {
    const adapter = createRemoteAdapter({ baseUrl: cfg.bridgeUrl, token: cfg.bridgeToken, fetchImpl });
    try {
      const health = await withTimeout(adapter.health(), timeoutMs);
      if (health?.ok) return { adapter, kind: 'remote', health };
    } catch {
      /* not running / wrong token — fall back to IndexedDB */
    }
  }
  return { adapter: createIdbAdapter(), kind: 'indexeddb' };
}

/**
 * Detect the backend and install it into the repository. Call once at startup.
 * @param {{ settings?: object, timeoutMs?: number, fetchImpl?: typeof fetch }} [opts]
 */
export async function initAdapter(opts = {}) {
  const { adapter, kind, health } = await selectAdapter(opts);
  useAdapter(adapter);
  return { adapter, kind, health };
}
