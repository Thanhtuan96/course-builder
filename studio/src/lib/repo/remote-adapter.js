/**
 * RemoteAdapter — STUB (Phase 26 replaces this file).
 *
 * Studio talks to a local server (later a Cloudflare Worker on D1) that implements the SAME
 * HTTP contract the SQLite server and the future Worker will expose. The adapter is a dumb,
 * table-level store: no business logic, no stamping. `repo/index.js` owns ids, owner_id,
 * timestamps and tombstones.
 *
 * --- StorageAdapter contract (implemented by idb-, memory- and remote-adapter) -------------
 *   get(table, id)                         -> row | null
 *   put(table, row)                        -> row            (upsert by row.id; adapter stamps nothing)
 *   putMany(table, rows)                   -> rows
 *   list(table, { where?, includeDeleted?, orderBy?, limit? }) -> rows
 *                                            where: equality on indexed fields only (schema.js)
 *                                            orderBy: field name | { field, dir: 'asc'|'desc' }
 *   softDelete(table, id)                  -> row | null     (sets deleted_at = now, ISO-8601)
 *   exportAll()                            -> { app, version, schemaVersion, exportedAt, tables }
 *   importAll(dump)                        -> { imported }
 *   info()                                 -> { kind: 'indexeddb'|'memory'|'remote', persistent }
 * -------------------------------------------------------------------------------------------
 *
 * --- HTTP contract (Phase 26 implements the server; a future D1 Worker reuses it) ----------
 *   GET  {base}/api/studio/db/health
 *        header  X-Studio-Token: <token>
 *        ->  { ok: true, kind: 'sqlite', path, schemaVersion }
 *
 *   POST {base}/api/studio/db
 *        header  X-Studio-Token: <token>
 *        body    { op: 'get'|'put'|'putMany'|'list'|'softDelete'|'exportAll'|'importAll',
 *                  table?: '<schema.js table name>', args: [ ...positional args ] }
 *        ->  { ok: true,  result }
 *         |  { ok: false, error: '<message>', code: '<code>' }
 *
 *   Table names MUST be validated against schema.js on both the client and the server.
 * -------------------------------------------------------------------------------------------
 */

/**
 * @typedef {Object} StorageAdapter
 * @property {(table: string, id: string) => Promise<object|null>} get
 * @property {(table: string, row: object) => Promise<object>} put
 * @property {(table: string, rows: object[]) => Promise<object[]>} putMany
 * @property {(table: string, opts?: object) => Promise<object[]>} list
 * @property {(table: string, id: string) => Promise<object|null>} softDelete
 * @property {() => Promise<object>} exportAll
 * @property {(dump: object) => Promise<{ imported: number }>} importAll
 * @property {() => Promise<{ kind: string, persistent: boolean }>} info
 */

/**
 * STUB — Phase 26 replaces this implementation with the real HTTP client.
 * @param {{ baseUrl: string, token?: string }} _opts
 * @returns {StorageAdapter}
 */
export function createRemoteAdapter(_opts) {
  throw new Error('not implemented — RemoteAdapter lands in Phase 26');
}
