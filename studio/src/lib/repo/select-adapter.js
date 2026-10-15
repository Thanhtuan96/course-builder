/**
 * select-adapter — resolve the ONE storage backend the learner chose (STORE-01/02).
 *
 * `settings.storage` is `'browser' | 'sqlite' | null`. When it is `null` the app calls
 * `resolveStorageChoice()` once, which adopts the store that actually holds data (or the default:
 * SQLite when a bridge is paired, else the browser) and records it. After that, `initAdapter()` uses
 * ONLY the chosen store and never auto-falls back — if SQLite is chosen but the server is down, a
 * BlockedAdapter is installed so nothing is read from or written to IndexedDB in that state.
 *
 * Deliberately free of React imports so the same code runs in tests/Node; Settings are read from
 * localStorage directly when not passed in.
 */
import { useAdapter, exportAll } from './index.js';
import { createIdbAdapter, IDB_DB_NAME } from './idb-adapter.js';
import { createRemoteAdapter } from './remote-adapter.js';
import { createBlockedAdapter, StorageUnavailableError } from './blocked-adapter.js';
import {
  SETTINGS_KEY as SETTINGS_KEY_FROM_SETTINGS,
  STORAGE_BROWSER,
  STORAGE_SQLITE,
  STORAGE_KINDS,
  saveSettings,
} from '../settings.js';

export const SETTINGS_KEY = SETTINGS_KEY_FROM_SETTINGS;
export { STORAGE_BROWSER, STORAGE_SQLITE, STORAGE_KINDS };
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

/** Whether a local server is paired (URL + token) — the signal for the SQLite default. */
export function hasBridgeConfig(settings = readStoredSettings()) {
  const cfg = bridgeConfigFrom(settings);
  return Boolean(cfg.bridgeUrl && cfg.bridgeToken);
}

/** The explicit choice, or null when the learner has not decided yet. */
export function storageKindFrom(settings = readStoredSettings()) {
  return STORAGE_KINDS.includes(settings?.storage) ? settings.storage : null;
}

/** The default used when there is no explicit choice: SQLite when a bridge is paired, else browser. */
export function defaultStorageKind(settings = readStoredSettings()) {
  return hasBridgeConfig(settings) ? STORAGE_SQLITE : STORAGE_BROWSER;
}

/** The store the app will actually use: explicit choice, else the default. */
export function effectiveStorageKind(settings = readStoredSettings()) {
  return storageKindFrom(settings) || defaultStorageKind(settings);
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/** Total rows across every table in a tables map. */
export function countRows(tables = {}) {
  return Object.values(tables).reduce((n, rows) => n + (Array.isArray(rows) ? rows.length : 0), 0);
}

/** Per-table row counts. */
export function tableCounts(dump) {
  const out = {};
  for (const [table, rows] of Object.entries(dump?.tables || {})) out[table] = Array.isArray(rows) ? rows.length : 0;
  return out;
}

/**
 * Probe the paired local server's `/db/health`.
 * @returns {Promise<{ available: boolean, configured: boolean, path: string, health?: object, error?: string }>}
 */
export async function probeSqlite(settings = readStoredSettings(), { fetchImpl, timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  const cfg = bridgeConfigFrom(settings);
  if (!cfg.bridgeUrl || !cfg.bridgeToken) {
    return { available: false, configured: false, path: '', error: 'No local server is paired.' };
  }
  const adapter = createRemoteAdapter({ baseUrl: cfg.bridgeUrl, token: cfg.bridgeToken, fetchImpl });
  try {
    const health = await withTimeout(adapter.health(), timeoutMs);
    if (health?.ok) return { available: true, configured: true, path: health.path || '', health };
    return { available: false, configured: true, path: '', error: 'The local server answered unexpectedly.' };
  } catch (err) {
    return { available: false, configured: true, path: '', error: err?.message || 'The local server is not reachable.' };
  }
}

/** Count what currently lives in the browser copy (IndexedDB), if any. */
export async function probeBrowserStore({ adapter } = {}) {
  try {
    const idb = adapter || createIdbAdapter();
    const dump = await idb.exportAll();
    const total = countRows(dump.tables);
    return { hasData: total > 0, total, dump };
  } catch {
    return { hasData: false, total: 0, dump: null };
  }
}

/** Probe both stores: availability + whether each holds data (used for one-time migration). */
export async function detectAvailableStores(settings = readStoredSettings(), opts = {}) {
  const probe = await probeSqlite(settings, opts);
  let sqliteTotal = 0;
  if (probe.available) {
    const cfg = bridgeConfigFrom(settings);
    try {
      const remote = createRemoteAdapter({ baseUrl: cfg.bridgeUrl, token: cfg.bridgeToken, fetchImpl: opts.fetchImpl });
      sqliteTotal = countRows((await remote.exportAll()).tables);
    } catch {
      /* treat as empty */
    }
  }
  const browser = await probeBrowserStore(opts);
  return {
    sqlite: { ...probe, hasData: sqliteTotal > 0, total: sqliteTotal },
    browser,
  };
}

/**
 * Decide where data should live for a learner who has not chosen yet (STORE-01 migration).
 * Pure: it never writes settings.
 *
 * @returns {Promise<{ storage?: string, migrated?: boolean, needsDecision?: boolean, stores?: object }>}
 */
export async function resolveStorageChoice(settings = readStoredSettings(), opts = {}) {
  const chosen = storageKindFrom(settings);
  if (chosen) return { storage: chosen, migrated: false };

  const stores = await detectAvailableStores(settings, opts);
  const sqliteHasData = stores.sqlite.available && stores.sqlite.total > 0;
  const browserHasData = stores.browser.total > 0;

  if (sqliteHasData && browserHasData) return { needsDecision: true, stores };
  if (sqliteHasData) return { storage: STORAGE_SQLITE, migrated: true, stores };
  if (browserHasData) return { storage: STORAGE_BROWSER, migrated: true, stores };
  return { storage: defaultStorageKind(settings), migrated: true, stores };
}

/**
 * Resolve the adapter for the chosen store. Never falls back: SQLite down ⇒ BlockedAdapter.
 * @param {{ settings?: object, timeoutMs?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{ adapter: object, kind: 'remote'|'indexeddb'|'blocked', storage: string, health?: object, blocked?: boolean, error?: string }>}
 */
export async function selectAdapter({ settings, timeoutMs = PROBE_TIMEOUT_MS, fetchImpl } = {}) {
  const effective = settings || readStoredSettings();
  const storage = effectiveStorageKind(effective);

  if (storage === STORAGE_SQLITE) {
    const probe = await probeSqlite(effective, { fetchImpl, timeoutMs });
    if (probe.available) {
      const cfg = bridgeConfigFrom(effective);
      const adapter = createRemoteAdapter({ baseUrl: cfg.bridgeUrl, token: cfg.bridgeToken, fetchImpl });
      return { adapter, kind: 'remote', storage, health: probe.health };
    }
    const reason = probe.configured
      ? 'The local server isn’t running — start it with `course-professor studio`.'
      : 'SQLite storage needs the local server, but no bridge is paired.';
    return {
      adapter: createBlockedAdapter({ kind: 'sqlite', reason, path: probe.path }),
      kind: 'blocked',
      storage,
      blocked: true,
      error: probe.error,
    };
  }

  return { adapter: createIdbAdapter(), kind: 'indexeddb', storage };
}

/**
 * Detect the backend and install it into the repository. Call once at startup.
 * @param {{ settings?: object, timeoutMs?: number, fetchImpl?: typeof fetch }} [opts]
 */
export async function initAdapter(opts = {}) {
  const result = await selectAdapter(opts);
  useAdapter(result.adapter);
  return result;
}

/* ------------------------------------------------------------------ moving data (STORE-03) */

/**
 * Describe a pending move so the UI can ask "Move N courses, M cards… to <target>?".
 * Reads the current store; when it is unreachable (blocked), returns `sourceUnavailable`.
 *
 * @param {string} target 'browser' | 'sqlite'
 * @returns {Promise<{ from: string, to: string, counts: object, targetReady: boolean, targetError: string, sourceUnavailable?: boolean, dump?: object, error?: string }>}
 */
export async function planStorageMove(target, { settings, fetchImpl, timeoutMs } = {}) {
  const effective = settings || readStoredSettings();
  const from = effectiveStorageKind(effective);
  const empty = { courses: 0, cards: 0, total: 0, tables: {} };

  let dump;
  try {
    dump = await exportAll();
  } catch (err) {
    return { from, to: target, counts: empty, targetReady: false, targetError: '', sourceUnavailable: true, error: err?.message || String(err) };
  }

  const tables = tableCounts(dump);
  const counts = { courses: tables.courses || 0, cards: tables.cards || 0, total: countRows(dump.tables), tables };

  let targetReady = true;
  let targetError = '';
  if (target === STORAGE_SQLITE) {
    const probe = await probeSqlite(effective, { fetchImpl, timeoutMs });
    targetReady = probe.available;
    targetError = probe.error || '';
  }
  return { from, to: target, counts, targetReady, targetError, dump };
}

/**
 * Copy everything from `dump` (or the current store) into `target`, verify per-table counts, and —
 * only when the counts match — record the setting and install the target adapter. The source copy is
 * left untouched (call `removePreviousCopy` when the learner asks). Settings/keys are never moved:
 * the repository has no settings table.
 *
 * @param {string} target 'browser' | 'sqlite'
 * @returns {Promise<{ switched: boolean, imported: number, expected: object, after: object, mismatches: string[], adapter?: object, error?: string }>}
 */
export async function performStorageMove(target, { settings, fetchImpl, timeoutMs, dump } = {}) {
  const effective = settings || readStoredSettings();
  const cfg = bridgeConfigFrom(effective);

  let targetAdapter;
  if (target === STORAGE_SQLITE) {
    const probe = await probeSqlite(effective, { fetchImpl, timeoutMs });
    if (!probe.available) {
      throw new StorageUnavailableError(probe.error || 'The local server is not reachable.', { kind: 'sqlite', path: probe.path });
    }
    targetAdapter = createRemoteAdapter({ baseUrl: cfg.bridgeUrl, token: cfg.bridgeToken, fetchImpl });
  } else {
    targetAdapter = createIdbAdapter();
  }

  const source = dump || (await exportAll());
  const expected = tableCounts(source);
  const result = await targetAdapter.importAll(source);
  const after = tableCounts(await targetAdapter.exportAll());
  const mismatches = Object.keys(expected).filter((t) => (after[t] || 0) < expected[t]);
  const imported = result?.imported ?? countRows(source.tables);

  if (mismatches.length) {
    return { switched: false, imported, expected, after, mismatches, adapter: targetAdapter };
  }

  saveSettings({ storage: target });
  useAdapter(targetAdapter);
  return { switched: true, imported, expected, after, mismatches, adapter: targetAdapter };
}

/** Delete the IndexedDB database (the whole browser copy). */
export function deleteBrowserDatabase(dbName = IDB_DB_NAME) {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve({ deleted: false });
      return;
    }
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve({ deleted: true });
    req.onerror = () => resolve({ deleted: false, error: req.error });
    req.onblocked = () => resolve({ deleted: false, blocked: true });
  });
}

/**
 * Remove the copy left behind after a switch (STORE-03). Never touches settings.
 * @param {string} kind the *old* store's kind ('browser' | 'sqlite')
 */
export async function removePreviousCopy(kind, { settings, fetchImpl } = {}) {
  if (kind === STORAGE_SQLITE) {
    const cfg = bridgeConfigFrom(settings || readStoredSettings());
    const remote = createRemoteAdapter({ baseUrl: cfg.bridgeUrl, token: cfg.bridgeToken, fetchImpl });
    return remote.clearAll();
  }
  return deleteBrowserDatabase();
}
