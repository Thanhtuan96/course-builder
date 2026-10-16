/**
 * studio-api/db.js — the Studio database routes (`/db/health`, `/db`).
 *
 * The SAME HTTP contract the Cloudflare Worker + D1 backend implements, so `RemoteAdapter` only
 * changes base URL + token (see studio-db.js). Extracted from `web/studio-api.js` (Phase 1 split).
 */
import { StudioDbError } from '../studio-db.js';

/**
 * Register the database routes on a router already protected by `guards.js`.
 *
 * @param {import('express').Router} router
 * @param {{ db: object }} ctx
 */
export function registerDbRoutes(router, { db }) {
  router.get('/db/health', (req, res) => {
    res.json({ ok: true, kind: 'sqlite', path: db.path, schemaVersion: db.schemaVersion });
  });

  router.post('/db', (req, res) => {
    const { op, table, args = [] } = req.body || {};
    if (typeof op !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing "op"', code: 'bad_request' });
      return;
    }
    try {
      let result;
      switch (op) {
        case 'get':
          result = db.get(table, args[0]);
          break;
        case 'put':
          result = db.put(table, args[0]);
          break;
        case 'putMany':
          result = db.putMany(table, args[0]);
          break;
        case 'list':
          result = db.list(table, args[0] || {});
          break;
        case 'softDelete':
          result = db.softDelete(table, args[0]);
          break;
        case 'exportAll':
          result = db.exportAll();
          break;
        case 'importAll':
          result = db.importAll(args[0]);
          break;
        case 'clearAll':
          result = db.clearAll();
          break;
        case 'info':
          result = db.info();
          break;
        default:
          res.status(400).json({ ok: false, error: `Unknown op: ${op}`, code: 'unknown_op' });
          return;
      }
      res.json({ ok: true, result });
    } catch (err) {
      const code = err instanceof StudioDbError ? err.code : 'db_error';
      res.status(400).json({ ok: false, error: err.message, code });
    }
  });
}
