/**
 * studio-store — a Node StorageAdapter over the Studio SQLite layer (`web/studio-db.js`).
 *
 * The CLI (`course-professor review`, `course-professor import`) and Studio share one database
 * file (`${PROFESSOR_HOME:-~/.professor}/professor.db`). Implementations differ in the storage
 * medium but never in business rules: installing this adapter with `installStudioStore()` (which
 * calls `useAdapter()` from `studio/src/lib/repo/index.js`) makes `gradeCard`, `addCards`, … the
 * exact same code paths Studio uses in the browser.
 *
 * Contract: see `studio/src/lib/repo/remote-adapter.js`. This adapter is intentionally dumb — the
 * repository owns ids, owner_id, timestamps and tombstones. The only extra it adds over
 * `createStudioDb()` is the indexed-field check that every StorageAdapter must enforce.
 */
import { createStudioDb } from '../web/studio-db.js';
import { assertIndexedField, tableSpec } from '../studio/src/lib/repo/schema.js';

/**
 * Create a StorageAdapter backed by the Studio SQLite database.
 *
 * @param {object} [opts]
 * @param {string} [opts.dbPath]        override the SQLite file (default: env/PROFESSOR_HOME)
 * @param {string} [opts.migrationsDir] override the migrations directory
 * @param {(msg: string) => void} [opts.log]
 * @returns {import('../studio/src/lib/repo/remote-adapter.js').StorageAdapter & {
 *   label: string, path: string, db: object, close: () => void,
 * }}
 */
export function createStudioStore({ dbPath, migrationsDir, log } = {}) {
  const db = createStudioDb({ dbPath, migrationsDir, log });

  return {
    label: 'sqlite',
    kind: 'sqlite',
    path: db.path,
    db,

    async get(table, id) {
      tableSpec(table);
      return db.get(table, id);
    },

    async put(table, row) {
      tableSpec(table);
      return db.put(table, row);
    },

    async putMany(table, rows) {
      tableSpec(table);
      return db.putMany(table, rows);
    },

    async list(table, opts = {}) {
      tableSpec(table);
      if (opts.where) {
        for (const field of Object.keys(opts.where)) assertIndexedField(table, field);
      }
      return db.list(table, opts);
    },

    async softDelete(table, id) {
      tableSpec(table);
      return db.softDelete(table, id);
    },

    async exportAll() {
      return db.exportAll();
    },

    async importAll(dump) {
      return db.importAll(dump);
    },

    async info() {
      return { kind: 'sqlite', persistent: true, path: db.path, schemaVersion: db.schemaVersion };
    },

    close() {
      db.close();
    },
  };
}

/**
 * Create a store and install it into the shared repository. Returns the store so callers can
 * keep a reference (to close the DB, or to write columns the repo API does not expose).
 *
 * @param {Parameters<typeof createStudioStore>[0]} [opts]
 */
export async function installStudioStore(opts = {}) {
  const { useAdapter } = await import('../studio/src/lib/repo/index.js');
  const store = createStudioStore(opts);
  useAdapter(store);
  return store;
}
