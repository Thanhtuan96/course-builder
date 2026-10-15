/**
 * Local-first storage on IndexedDB. Everything a learner creates lives in their browser;
 * nothing leaves the device except the prompts sent to the AI provider they choose.
 *
 * Stores:
 *   courses — one record per course (lessons embedded)
 *   cards   — flashcards with spaced-repetition state
 *   meta    — settings, activity log and other singletons keyed by name
 *
 * Falls back to an in-memory map when IndexedDB is unavailable (private mode, tests).
 */

const DB_NAME = 'professor-studio';
const DB_VERSION = 1;
const STORES = ['courses', 'cards', 'meta'];

let dbPromise = null;
const memory = Object.fromEntries(STORES.map((s) => [s, new Map()]));

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === 'meta' ? 'key' : 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        if (!db) {
          resolve(fn(null));
          return;
        }
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req?.result);
        tx.onerror = () => reject(tx.error);
      })
  );
}

export async function list(store) {
  const rows = await run(store, 'readonly', (os) => (os ? os.getAll() : null));
  return rows ?? [...memory[store].values()];
}

export async function get(store, id) {
  const row = await run(store, 'readonly', (os) => (os ? os.get(id) : null));
  return row ?? memory[store].get(id) ?? null;
}

export async function put(store, value) {
  const key = store === 'meta' ? value.key : value.id;
  await run(store, 'readwrite', (os) => (os ? os.put(value) : memory[store].set(key, value)));
  return value;
}

export async function remove(store, id) {
  await run(store, 'readwrite', (os) => (os ? os.delete(id) : memory[store].delete(id)));
}

export async function getMeta(key, fallback = null) {
  const row = await get('meta', key);
  return row ? row.value : fallback;
}

export function setMeta(key, value) {
  return put('meta', { key, value });
}

/** Full backup of every store — used for export/import and future cloud sync. */
export async function dumpAll() {
  const out = { app: 'professor-studio', version: 1, exportedAt: new Date().toISOString() };
  for (const s of STORES) out[s] = await list(s);
  // Never put API keys in a backup file.
  out.meta = out.meta.filter((m) => m.key !== 'settings');
  return out;
}

export async function restoreAll(backup) {
  if (backup?.app !== 'professor-studio') throw new Error('Not a Professor Studio backup file');
  for (const s of STORES) {
    for (const row of backup[s] || []) await put(s, row);
  }
}

export function uid(prefix = '') {
  const rand = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return prefix + rand.replace(/-/g, '').slice(0, 12);
}
