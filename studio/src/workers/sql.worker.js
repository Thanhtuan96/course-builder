/**
 * SQL runner worker (CODE-02) — sql.js (SQLite compiled to WebAssembly), lazy-loaded.
 *
 * Runs every `.sql` workspace file in order (schema/seed first, query last) and returns the last
 * result set so the UI can render a table. `-- @check` / `-- @expect` comment directives become
 * per-check pass/fail (CODE-03).
 *
 * Protocol mirrors js.worker.js, plus `{ type: 'rows', columns, rows }`.
 */
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { parseSqlChecks, compareSqlRows } from '../lib/runner/checks.js';

let sqlPromise = null;

/** @returns {Promise<any>} */
function getSql() {
  if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: () => wasmUrl });
  return sqlPromise;
}

self.onmessage = (event) => {
  const msg = event.data || {};
  if (msg.type !== 'run') return;
  run(msg).catch((err) => {
    post({ type: 'stderr', text: `${err && err.message ? err.message : err}\n` });
    post({ type: 'done', exitCode: 1 });
  });
};

/** @param {any} data */
function post(data) {
  self.postMessage(data);
}

/**
 * @param {{ files?: Record<string,string>, entry?: string }} msg
 */
async function run({ files = {}, entry = null }) {
  const SQL = await getSql();
  const db = new SQL.Database();

  const paths = Object.keys(files).map((p) => String(p).replace(/\\/g, '/'));
  const ordered = [...paths.filter((p) => p !== entry), ...paths.filter((p) => p === entry)];
  const finalPaths = ordered.length ? ordered : paths;

  let lastResult = null;
  let scriptSource = '';
  for (const path of finalPaths) {
    const source = String(files[path] ?? '');
    scriptSource += `\n${source}`;
    let results;
    try {
      results = db.exec(source);
    } catch (err) {
      post({ type: 'stderr', text: `SQL error in ${path}: ${err?.message || err}\n` });
      db.close();
      post({ type: 'done', exitCode: 1 });
      return;
    }
    if (results && results.length) lastResult = results[results.length - 1];
  }

  const columns = lastResult?.columns || [];
  const rawRows = lastResult?.values || [];
  const rows = rawRows.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));

  post({ type: 'stdout', text: renderTable(columns, rawRows) });
  if (columns.length) post({ type: 'rows', columns, rows });

  const directives = parseSqlChecks(scriptSource);
  if (directives.length) {
    const checks = directives.map((d) => {
      const passed = compareSqlRows(rows, d.expected);
      return {
        name: d.name,
        passed,
        message: passed ? undefined : `expected ${JSON.stringify(d.expected)}`,
      };
    });
    post({ type: 'checks', checks });
  }

  db.close();
  post({ type: 'done', exitCode: 0 });
}

/**
 * @param {string[]} columns
 * @param {any[][]} rows
 */
function renderTable(columns, rows) {
  if (!columns.length) return '-- query returned no rows\n';
  const widths = columns.map((c, i) => Math.max(String(c).length, ...rows.map((r) => String(r[i] ?? '').length)));
  const line = (cells) => `${cells.map((cell, i) => String(cell ?? '').padEnd(widths[i])).join(' | ')}\n`;
  let out = line(columns);
  out += `${widths.map((w) => '-'.repeat(w)).join('-+-')}\n`;
  for (const row of rows) out += line(row);
  out += `(${rows.length} row${rows.length === 1 ? '' : 's'})\n`;
  return out;
}
