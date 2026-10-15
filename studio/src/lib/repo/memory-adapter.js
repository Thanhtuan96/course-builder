/**
 * In-memory StorageAdapter. Used directly in tests and as the fallback when IndexedDB is
 * unavailable (private mode, some embedded webviews, vitest without fake-indexeddb).
 *
 * Contract (see remote-adapter.js): dumb table-level storage. No stamping, no business logic.
 */
import { TABLE_NAMES, SCHEMA_VERSION, tableSpec, assertIndexedField } from './schema.js';

export const APP_ID = 'professor-studio';

function applyList(rows, { where, includeDeleted = false, orderBy, limit } = {}) {
  let out = rows;
  if (where) {
    for (const key of Object.keys(where)) {
      out = out.filter((r) => r[key] === where[key]);
    }
  }
  if (!includeDeleted) out = out.filter((r) => !r.deleted_at);
  if (orderBy) {
    const field = typeof orderBy === 'string' ? orderBy : orderBy.field;
    const dir = typeof orderBy === 'string' ? 1 : orderBy.dir === 'desc' ? -1 : 1;
    out = [...out].sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (av === bv) return 0;
      return (av > bv ? 1 : -1) * dir;
    });
  }
  if (typeof limit === 'number') out = out.slice(0, limit);
  return out.map((r) => ({ ...r }));
}

/**
 * @returns {import('./remote-adapter.js').StorageAdapter & { label: string }}
 */
export function createMemoryAdapter() {
  /** @type {Record<string, Map<string, object>>} */
  const stores = Object.fromEntries(TABLE_NAMES.map((t) => [t, new Map()]));

  function store(table) {
    const s = stores[table];
    if (!s) throw new Error(`Unknown table: ${table}`);
    return s;
  }

  return {
    label: 'memory',
    async get(table, id) {
      const row = store(table).get(id);
      return row ? { ...row } : null;
    },
    async put(table, row) {
      const spec = tableSpec(table);
      const id = row[spec.id];
      if (id === undefined || id === null) throw new Error(`Row for "${table}" is missing "${spec.id}"`);
      const next = { ...row, [spec.id]: id };
      store(table).set(id, next);
      return { ...next };
    },
    async putMany(table, rows) {
      const out = [];
      for (const row of rows || []) out.push(await this.put(table, row));
      return out;
    },
    async list(table, opts = {}) {
      if (opts.where) {
        for (const field of Object.keys(opts.where)) assertIndexedField(table, field);
      }
      return applyList([...store(table).values()], opts);
    },
    async softDelete(table, id) {
      const s = store(table);
      const row = s.get(id);
      if (!row) return null;
      const next = { ...row, deleted_at: new Date().toISOString() };
      s.set(id, next);
      return { ...next };
    },
    async exportAll() {
      const tables = {};
      for (const t of TABLE_NAMES) tables[t] = [...stores[t].values()].map((r) => ({ ...r }));
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
      for (const t of TABLE_NAMES) {
        const s = stores[t];
        for (const row of dump.tables[t] || []) {
          const spec = tableSpec(t);
          s.set(row[spec.id], { ...row });
        }
      }
      return { imported: TABLE_NAMES.reduce((n, t) => n + (dump.tables[t]?.length || 0), 0) };
    },
    async info() {
      return { kind: 'memory', persistent: false };
    },
  };
}

/** @param {any} dump */
export function validateDump(dump) {
  if (!dump || dump.app !== APP_ID) throw new Error('Not a Professor Studio backup file');
  if (!dump.tables || typeof dump.tables !== 'object') throw new Error('Backup file has no tables');
}
