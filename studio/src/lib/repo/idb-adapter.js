/**
 * IndexedDB StorageAdapter.
 *
 * One object store per table in schema.js, one index per indexed field. All filtering is done
 * in JS after a getAll so the semantics are byte-for-byte identical to the memory and (future)
 * remote adapters — the indexes exist for the SQLite/D1 side and for future query optimisation.
 *
 * When IndexedDB is unavailable (private mode, locked-down webview, vitest without
 * fake-indexeddb) every method transparently delegates to the in-memory adapter and
 * `info().kind` reports 'memory'.
 */
import { TABLE_NAMES, SCHEMA_VERSION, tableSpec, assertIndexedField } from './schema.js';
import { createMemoryAdapter, validateDump, APP_ID } from './memory-adapter.js';

const DB_NAME = 'professor-studio';
const DB_VERSION = 2; // v1 was the seed db.js (courses/cards/meta); v2 is the normalized schema.

function createStores(db, tx) {
  for (const table of TABLE_NAMES) {
    const spec = tableSpec(table);
    let os;
    if (!db.objectStoreNames.contains(table)) {
      os = db.createObjectStore(table, { keyPath: spec.id });
    } else {
      os = tx.objectStore(table);
    }
    for (const field of spec.indexes) {
      if (!os.indexNames.contains(field)) os.createIndex(field, field, { unique: false });
    }
  }
  if (db.objectStoreNames.contains('meta')) db.deleteObjectStore('meta'); // legacy seed store
}

function openDb(dbName) {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(dbName, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      try {
        createStores(req.result, req.transaction);
      } catch {
        // migration failure aborts the open; onerror resolves null and we fall back to memory
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * @param {{ dbName?: string }} [opts]
 * @returns {import('./remote-adapter.js').StorageAdapter & { label: string }}
 */
export function createIdbAdapter({ dbName = DB_NAME } = {}) {
  const fallback = createMemoryAdapter();
  let persistent = false;
  let persistRequested = false;

  const ready = openDb(dbName).then(async (db) => {
    if (!db) return null;
    try {
      const storage = globalThis.navigator?.storage;
      if (storage && !persistRequested) {
        persistRequested = true;
        persistent = (await storage.persist?.()) ?? (await storage.persisted?.()) ?? false;
      }
    } catch {
      persistent = false;
    }
    return db;
  });

  async function getAll(table) {
    const db = await ready;
    if (!db) return fallback.list(table, { includeDeleted: true });
    const tx = db.transaction(table, 'readonly');
    const rows = (await requestToPromise(tx.objectStore(table).getAll())) || [];
    await txDone(tx);
    return rows;
  }

  return {
    label: 'indexeddb',
    async get(table, id) {
      const db = await ready;
      if (!db) return fallback.get(table, id);
      const tx = db.transaction(table, 'readonly');
      const row = await requestToPromise(tx.objectStore(table).get(id));
      await txDone(tx);
      return row ?? null;
    },
    async put(table, row) {
      const db = await ready;
      if (!db) return fallback.put(table, row);
      if (row?.[tableSpec(table).id] === undefined) throw new Error(`Row for "${table}" is missing its id`);
      const tx = db.transaction(table, 'readwrite');
      tx.objectStore(table).put(row);
      await txDone(tx);
      return { ...row };
    },
    async putMany(table, rows) {
      const db = await ready;
      if (!db) return fallback.putMany(table, rows);
      const tx = db.transaction(table, 'readwrite');
      const os = tx.objectStore(table);
      for (const row of rows || []) os.put(row);
      await txDone(tx);
      return (rows || []).map((r) => ({ ...r }));
    },
    async list(table, opts = {}) {
      if (opts.where) for (const f of Object.keys(opts.where)) assertIndexedField(table, f);
      const rows = await getAll(table);
      return filterRows(rows, opts);
    },
    async softDelete(table, id) {
      const db = await ready;
      if (!db) return fallback.softDelete(table, id);
      const tx = db.transaction(table, 'readwrite');
      const os = tx.objectStore(table);
      const row = await requestToPromise(os.get(id));
      if (!row) {
        await txDone(tx);
        return null;
      }
      const next = { ...row, deleted_at: new Date().toISOString() };
      os.put(next);
      await txDone(tx);
      return next;
    },
    async exportAll() {
      const tables = {};
      for (const table of TABLE_NAMES) tables[table] = await getAll(table);
      return {
        app: APP_ID,
        version: 1,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        tables,
      };
    },
    async importAll(dump) {
      validateDump(dump);
      const db = await ready;
      if (!db) return fallback.importAll(dump);
      let imported = 0;
      for (const table of TABLE_NAMES) {
        const rows = dump.tables[table] || [];
        if (!rows.length) continue;
        const tx = db.transaction(table, 'readwrite');
        const os = tx.objectStore(table);
        for (const row of rows) os.put(row);
        await txDone(tx);
        imported += rows.length;
      }
      return { imported };
    },
    async info() {
      const db = await ready;
      return db ? { kind: 'indexeddb', persistent } : { kind: 'memory', persistent: false };
    },
  };
}

/** Shared list filtering — identical across adapters. */
export function filterRows(rows, { where, includeDeleted = false, orderBy, limit } = {}) {
  let out = rows || [];
  if (where) for (const key of Object.keys(where)) out = out.filter((r) => r[key] === where[key]);
  if (!includeDeleted) out = out.filter((r) => !r.deleted_at);
  if (orderBy) {
    const field = typeof orderBy === 'string' ? orderBy : orderBy.field;
    const dir = typeof orderBy === 'string' ? 1 : orderBy.dir === 'desc' ? -1 : 1;
    out = [...out].sort((a, b) => (a[field] === b[field] ? 0 : (a[field] > b[field] ? 1 : -1) * dir));
  }
  if (typeof limit === 'number') out = out.slice(0, limit);
  return out.map((r) => ({ ...r }));
}
