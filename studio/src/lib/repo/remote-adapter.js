/**
 * RemoteAdapter — talks to the local Studio server (`web/studio-api.js`) over HTTP, and to the
 * future Cloudflare Worker + D1 backend unchanged (same contract, only base URL + token differ).
 *
 * The adapter is a dumb, table-level store: no business logic, no stamping. `repo/index.js` owns
 * ids, owner_id, timestamps and tombstones. See the contract documented below.
 *
 * --- StorageAdapter contract (same as idb- and memory-adapter) ------------------------------
 *   get(table, id)                         -> row | null
 *   put(table, row)                        -> row            (upsert by row.id; adapter stamps nothing)
 *   putMany(table, rows)                   -> rows
 *   list(table, { where?, includeDeleted?, orderBy?, limit? }) -> rows
 *                                            where: equality on indexed fields only (schema.js)
 *                                            orderBy: field name | { field, dir: 'asc'|'desc' }
 *   softDelete(table, id)                  -> row | null     (sets deleted_at = now, ISO-8601)
 *   exportAll()                            -> { app, version, schemaVersion, exportedAt, tables }
 *   importAll(dump)                        -> { imported }
 *   info()                                 -> { kind: 'indexeddb'|'memory'|'remote', persistent, … }
 * -------------------------------------------------------------------------------------------
 *
 * --- HTTP contract (implemented by web/studio-api.js; the D1 Worker reuses it) --------------
 *   GET  {base}/api/studio/db/health   header X-Studio-Token
 *        ->  { ok: true, kind: 'sqlite', path, schemaVersion }
 *   POST {base}/api/studio/db          header X-Studio-Token
 *        body    { op, table?, args: [ ...positional args ] }
 *        ->  { ok: true,  result }
 *         |  { ok: false, error: '<message>', code: '<code>' }
 * -------------------------------------------------------------------------------------------
 */
import { tableSpec, assertIndexedField } from './schema.js';

/** Raised when the Studio server rejects a request (used so callers can distinguish from network). */
export class RemoteAdapterError extends Error {
  /** @param {string} message @param {{ code?: string, status?: number }} [info] */
  constructor(message, { code = 'remote_error', status = 0 } = {}) {
    super(message);
    this.name = 'RemoteAdapterError';
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {{ baseUrl: string, token?: string, fetchImpl?: typeof fetch }} opts
 * @returns {import('./remote-adapter.js').StorageAdapter & { label: string, health: () => Promise<any> }}
 */
export function createRemoteAdapter({ baseUrl, token, fetchImpl = globalThis.fetch } = {}) {
  const root = String(baseUrl || '').replace(/\/$/, '');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'X-Studio-Token': token } : {}),
  };
  /** @type {{ path?: string, schemaVersion?: number }|null} */
  let cachedHealth = null;

  async function post(op, table, args = []) {
    let res;
    try {
      res = await fetchImpl(`${root}/api/studio/db`, {
        method: 'POST',
        headers,
        body: JSON.stringify(table ? { op, table, args } : { op, args }),
      });
    } catch (err) {
      throw new RemoteAdapterError(`Studio server not reachable at ${root}: ${err.message}`, { code: 'network' });
    }
    if (res.status === 401 || res.status === 403) {
      throw new RemoteAdapterError(`Studio server rejected the pairing token (${res.status})`, {
        code: 'auth',
        status: res.status,
      });
    }
    if (!res.ok) {
      let payload = null;
      try {
        payload = await res.json();
      } catch {
        /* not JSON */
      }
      throw new RemoteAdapterError(payload?.error || `Studio server error ${res.status}`, {
        code: payload?.code || 'server',
        status: res.status,
      });
    }
    const json = await res.json();
    if (!json.ok) throw new RemoteAdapterError(json.error || 'Studio server error', { code: json.code || 'db_error' });
    return json.result;
  }

  async function health() {
    let res;
    try {
      res = await fetchImpl(`${root}/api/studio/db/health`, { headers });
    } catch (err) {
      throw new RemoteAdapterError(`Studio server not reachable at ${root}: ${err.message}`, { code: 'network' });
    }
    if (res.status === 401 || res.status === 403) {
      throw new RemoteAdapterError(`Studio server rejected the pairing token (${res.status})`, { code: 'auth', status: res.status });
    }
    if (!res.ok) throw new RemoteAdapterError(`Studio server error ${res.status}`, { code: 'server', status: res.status });
    const json = await res.json();
    if (!json.ok) throw new RemoteAdapterError(json.error || 'Studio server error', { code: json.code || 'db_error' });
    cachedHealth = { path: json.path, schemaVersion: json.schemaVersion };
    return json;
  }

  return {
    label: 'remote',
    async get(table, id) {
      tableSpec(table);
      return post('get', table, [id]);
    },
    async put(table, row) {
      tableSpec(table);
      return post('put', table, [row]);
    },
    async putMany(table, rows) {
      tableSpec(table);
      return post('putMany', table, [rows]);
    },
    async list(table, opts = {}) {
      tableSpec(table);
      if (opts.where) for (const field of Object.keys(opts.where)) assertIndexedField(table, field);
      return post('list', table, [opts]);
    },
    async softDelete(table, id) {
      tableSpec(table);
      return post('softDelete', table, [id]);
    },
    async exportAll() {
      return post('exportAll');
    },
    async importAll(dump) {
      return post('importAll', null, [dump]);
    },
    async info() {
      try {
        const h = cachedHealth || (await health());
        return { kind: 'remote', persistent: true, path: h.path, schemaVersion: h.schemaVersion };
      } catch {
        return { kind: 'remote', persistent: true };
      }
    },
    health,
  };
}
