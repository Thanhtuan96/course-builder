/**
 * studio-db.js — the Studio SQLite storage layer (DATA-04).
 *
 * A dumb, table-level StorageAdapter (see `studio/src/lib/repo/remote-adapter.js` for the contract)
 * backed by Node's built-in `node:sqlite` (`DatabaseSync`). No business logic: `studio/src/lib/repo`
 * owns ids, owner_id, timestamps and tombstones.
 *
 *   • DB file:  ${PROFESSOR_HOME:-~/.professor}/professor.db  (override with STUDIO_DB)
 *   • Migrations: studio/migrations/*.sql applied in filename order (override with STUDIO_MIGRATIONS_DIR)
 *   • Tracking table: `d1_migrations` (same name/shape wrangler D1 uses) so the SAME migration files
 *     run unchanged here and on Cloudflare D1.
 *
 * Safety: table and column names are validated against the migration-defined schema, read once at
 * startup via `sqlite_master` + `pragma_table_info`. Every statement is parameterized; identifiers
 * are only ever emitted after a whitelist check.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const APP_ID = 'professor-studio';
export const SCHEMA_VERSION = 1;
export const MIGRATIONS_TABLE = 'd1_migrations';

/** Error carrying a stable machine code for the HTTP layer. */
export class StudioDbError extends Error {
  /** @param {string} message @param {string} [code] */
  constructor(message, code = 'db_error') {
    super(message);
    this.name = 'StudioDbError';
    this.code = code;
  }
}

/**
 * @param {Record<string,string|undefined>} [env]
 * @returns {string} absolute path to the SQLite file
 */
export function resolveDbPath(env = process.env) {
  if (env.STUDIO_DB) return env.STUDIO_DB;
  const home = env.PROFESSOR_HOME || join(homedir(), '.professor');
  return join(home, 'professor.db');
}

/**
 * @param {Record<string,string|undefined>} [env]
 * @returns {string} absolute path to the migrations directory
 */
export function resolveMigrationsDir(env = process.env) {
  if (env.STUDIO_MIGRATIONS_DIR) return env.STUDIO_MIGRATIONS_DIR;
  return join(__dirname, '..', 'studio', 'migrations');
}

/** Quote a SQL identifier (only ever called after a whitelist check). */
function q(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/** Default value for a NOT NULL column that has no SQL DEFAULT and was not supplied. */
function defaultForType(type) {
  const t = String(type || '').toUpperCase();
  if (t.includes('INT') || t.includes('REAL') || t.includes('NUM') || t.includes('DEC') || t.includes('DOUB') || t.includes('FLOA')) {
    return 0;
  }
  return '';
}

/** Coerce a JS value into something node:sqlite can bind. */
function bindValue(value) {
  if (value === undefined || value === null) return null;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'bigint') return value;
  if (type === 'boolean') return value ? 1 : 0;
  if (value instanceof Uint8Array) return value;
  // JSON / objects / arrays are stored as TEXT (the schema stores JSON as TEXT).
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function ensureMigrationsTable(db) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS ${q(MIGRATIONS_TABLE)} (` +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
      'name TEXT UNIQUE, ' +
      'applied_at TEXT)'
  );
}

/**
 * Apply every *.sql file in `dir` that is not yet recorded, in filename order.
 * @param {DatabaseSync} db
 * @param {string} dir
 * @returns {string[]} names of migrations applied in this run
 */
export function runMigrations(db, dir) {
  ensureMigrationsTable(db);
  const applied = new Set(db.prepare(`SELECT name FROM ${q(MIGRATIONS_TABLE)}`).all().map((r) => r.name));
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const ran = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf-8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare(`INSERT INTO ${q(MIGRATIONS_TABLE)} (name, applied_at) VALUES (?, ?)`).run(
        file,
        new Date().toISOString()
      );
      db.exec('COMMIT');
      ran.push(file);
    } catch (err) {
      db.exec('ROLLBACK');
      throw new StudioDbError(`Migration ${file} failed: ${err.message}`, 'migration_failed');
    }
  }
  return ran;
}

/**
 * Read the live schema (tables + columns) via sqlite_master + pragma_table_info.
 * @param {DatabaseSync} db
 * @returns {Record<string, { idName: string, columns: Map<string, {name:string,type:string,notnull:boolean,pk:boolean,dflt:any}> }>}
 */
export function introspectSchema(db) {
  const schema = {};
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != ?"
    )
    .all(MIGRATIONS_TABLE);
  for (const { name } of tables) {
    const cols = db.prepare('SELECT * FROM pragma_table_info(?)').all(name);
    const columns = new Map();
    let idName = 'id';
    for (const c of cols) {
      const entry = {
        name: c.name,
        type: c.type,
        notnull: !!c.notnull,
        pk: !!c.pk,
        dflt: c.dflt_value,
      };
      columns.set(c.name, entry);
      if (entry.pk) idName = entry.name;
    }
    schema[name] = { idName, columns };
  }
  return schema;
}

/**
 * Open (creating if needed) the SQLite database, run migrations and introspect the schema.
 * @param {{ dbPath?: string, migrationsDir?: string, log?: (msg: string) => void }} [opts]
 */
export function createStudioDb({ dbPath, migrationsDir, log = () => {} } = {}) {
  const path = dbPath || resolveDbPath();
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 4000');

  const migrationsRun = runMigrations(db, migrationsDir || resolveMigrationsDir());
  const schema = introspectSchema(db);
  if (migrationsRun.length) log(`Applied ${migrationsRun.length} migration(s): ${migrationsRun.join(', ')}`);

  function specFor(table) {
    const spec = schema[table];
    if (!spec) throw new StudioDbError(`Unknown table: ${table}`, 'unknown_table');
    return spec;
  }
  function assertColumn(spec, column, table) {
    if (!spec.columns.has(column)) {
      throw new StudioDbError(`Unknown column "${column}" on table "${table}"`, 'unknown_column');
    }
  }

  /**
   * Upsert a row, replacing the whole record (matches the memory/IndexedDB adapters: fields the
   * caller omits are reset to their column default / NULL, not merged).
   * @returns {object|null} the stored row
   */
  function put(table, row) {
    const spec = specFor(table);
    if (!row || typeof row !== 'object') throw new StudioDbError(`put(${table}) needs a row object`, 'bad_row');
    const id = row[spec.idName];
    if (id === undefined || id === null) {
      throw new StudioDbError(`Row for "${table}" is missing "${spec.idName}"`, 'missing_id');
    }
    const cols = [];
    const values = [];
    for (const [key, value] of Object.entries(row)) {
      if (value === undefined) continue;
      // Ignore keys that are not columns of this table (keeps the store dumb/KV-like; the repo
      // always writes schema columns, so this only tolerates extra fields).
      if (!spec.columns.has(key)) continue;
      cols.push(key);
      values.push(bindValue(value));
    }
    // Fill NOT NULL columns that have no SQL default so the insert cannot violate constraints.
    for (const col of spec.columns.values()) {
      if (col.pk || cols.includes(col.name)) continue;
      if (col.notnull && col.dflt === null) {
        cols.push(col.name);
        values.push(defaultForType(col.type));
      }
    }
    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT OR REPLACE INTO ${q(table)} (${cols.map(q).join(', ')}) VALUES (${placeholders})`;
    db.prepare(sql).run(...values);
    return get(table, id);
  }

  /** @returns {object|null} */
  function get(table, id) {
    const spec = specFor(table);
    const row = db.prepare(`SELECT * FROM ${q(table)} WHERE ${q(spec.idName)} = ?`).get(id);
    return row ?? null;
  }

  /** @returns {object[]} */
  function putMany(table, rows) {
    specFor(table);
    const list = Array.isArray(rows) ? rows : [];
    db.exec('BEGIN');
    try {
      for (const row of list) put(table, row);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return list.map((r) => get(table, r[specFor(table).idName])).filter(Boolean);
  }

  /**
   * @param {string} table
   * @param {{ where?: Record<string, any>, includeDeleted?: boolean, orderBy?: string|{field:string,dir?:'asc'|'desc'}, limit?: number }} [opts]
   * @returns {object[]}
   */
  function list(table, opts = {}) {
    const spec = specFor(table);
    const conds = [];
    const params = [];
    for (const [field, value] of Object.entries(opts.where || {})) {
      assertColumn(spec, field, table);
      conds.push(`${q(field)} = ?`);
      params.push(bindValue(value));
    }
    if (!opts.includeDeleted) conds.push('deleted_at IS NULL');
    let sql = `SELECT * FROM ${q(table)}`;
    if (conds.length) sql += ` WHERE ${conds.join(' AND ')}`;
    if (opts.orderBy) {
      const field = typeof opts.orderBy === 'string' ? opts.orderBy : opts.orderBy.field;
      const dir = typeof opts.orderBy === 'object' && opts.orderBy.dir === 'desc' ? 'DESC' : 'ASC';
      assertColumn(spec, field, table);
      sql += ` ORDER BY ${q(field)} ${dir}`;
    }
    if (typeof opts.limit === 'number' && Number.isFinite(opts.limit)) {
      sql += ` LIMIT ${Math.max(0, Math.floor(opts.limit))}`;
    }
    return db.prepare(sql).all(...params);
  }

  /** @returns {object|null} */
  function softDelete(table, id) {
    const spec = specFor(table);
    db.prepare(`UPDATE ${q(table)} SET deleted_at = ? WHERE ${q(spec.idName)} = ?`).run(
      new Date().toISOString(),
      id
    );
    return get(table, id);
  }

  function exportAll() {
    const tables = {};
    for (const name of Object.keys(schema)) {
      tables[name] = db.prepare(`SELECT * FROM ${q(name)}`).all();
    }
    return {
      app: APP_ID,
      version: 1,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      tables,
    };
  }

  function importAll(dump) {
    if (!dump || dump.app !== APP_ID) throw new StudioDbError('Not a Professor Studio backup file', 'bad_backup');
    if (!dump.tables || typeof dump.tables !== 'object') {
      throw new StudioDbError('Backup file has no tables', 'bad_backup');
    }
    let imported = 0;
    db.exec('BEGIN');
    try {
      for (const table of Object.keys(schema)) {
        for (const row of dump.tables[table] || []) {
          put(table, row);
          imported += 1;
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return { imported };
  }

  function close() {
    try {
      db.close();
    } catch {
      /* already closed */
    }
  }

  /** Remove every row from every table (STORE-03 "remove the old copy"). Schema is preserved. */
  function clearAll() {
    db.exec('BEGIN');
    try {
      for (const name of Object.keys(schema)) db.exec(`DELETE FROM ${q(name)}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return { cleared: true };
  }

  return {
    path,
    tables: Object.keys(schema),
    schemaVersion: SCHEMA_VERSION,
    migrationsRun,
    get,
    put,
    putMany,
    list,
    softDelete,
    exportAll,
    importAll,
    clearAll,
    close,
    /** @returns {{kind:'sqlite', path:string, schemaVersion:number}} */
    info() {
      return { kind: 'sqlite', path, schemaVersion: SCHEMA_VERSION };
    },
  };
}
