# HANDOFF-26 — Local Server, SQLite & Deploy

Phase 26 owns the local agent bridge, the SQLite repository server, backup/export UI, the remote
storage adapter and deploy docs. These are the changes **outside** this phase's owned files that the
integrator should apply (or that other phases must know about).

## 1. Wire the storage auto-detect at app startup (required for DATA-04)

`studio/src/lib/repo/remote-adapter.js` and `select-adapter.js` are done, but the app must call the
detector once at startup to actually switch to SQLite when the local server is configured. `App.jsx`
(and `main.jsx`) are Phase 22's frozen files, so this one line is intentionally left out:

```jsx
// studio/src/App.jsx  — inside the existing startup useEffect (before seedDemoCourse()):
import { initAdapter } from './lib/repo/select-adapter.js';

useEffect(() => {
  let alive = true;
  initAdapter()                       // ← probes the bridge; falls back to IndexedDB
    .catch(() => {})
    .finally(() => alive && setReady(true));
  return () => { alive = false; };
}, []);
```

`select-adapter.js` is React-free and reads `professor-studio:settings` from `localStorage` on its
own, so no settings object needs to be threaded in. Without this line, Studio stays on IndexedDB and
the "Import browser data into SQLite" button in Settings stays disabled.

(The `DataPanel` already calls `initAdapter()` when Settings mounts, so visiting Settings is enough to
activate SQLite — but startup detection is the intended behavior.)

## 2. `studio/test/adapter-contract.test.js` — one additive line

The shared contract's `info` test hard-coded `kind` to `'indexeddb'` for any non-memory adapter, which
is impossible for the remote adapter (whose `kind` is `'remote'`). I made the expectation opt-in:

```diff
- expect(info.kind).toBe(label === 'memory' ? 'memory' : 'indexeddb');
+ expect(info.kind).toBe(makeAdapter.kind || (label === 'memory' ? 'memory' : 'indexeddb'));
```

`remoteFactory.kind = 'remote'` is set in `test/studio-api.test.js`. The memory/IndexedDB factories
are unaffected. This was required to satisfy the brief's "run `runAdapterContract` against the remote
adapter". No other phase touches this file.

## 3. `web/server.js` — bind to loopback (defense-in-depth)

The brief allows exactly **one import + one `app.use`** in `web/server.js`, so `server.listen(PORT)`
still binds to all interfaces. The Studio router already **rejects non-loopback clients** at the
router level, so the bridge is safe by default. For belt-and-braces, the integrator may change:

```diff
- server.listen(PORT, () => { … });
+ server.listen(PORT, '127.0.0.1', () => { … });
```

(Only the Studio routes are loopback-guarded; the legacy `/api/chat` and static file routes are
unchanged, matching the "do not touch anything else" constraint.)

## 4. Phase 29 — mount `web/studio-runner.js` inside `studio-api.js`

Per the roadmap, Phase 29 adds `web/studio-runner.js` and integrates it via HANDOFF so it inherits
the pairing token + CORS. Since Phase 26 owns `studio-api.js`, Phase 29 should:

1. Export an Express Router (or handler) from `studio-runner.js`.
2. Mount it **inside `createStudioRouter`** after the token + CORS middlewares, e.g.
   `router.use('/run', studioRunner);` so it is automatically token- and origin-gated.

Do **not** mount it in `web/server.js` directly — that would bypass the token/CORS middleware.

## 5. Phase 27 — unchanged

Phase 27's `saveFilesFromResponse` behaviour is untouched. The Studio bridge never calls it.

## 6. Deploy: move `void.config.ts` to the repo root

`studio/void.config.ts` is committed for reference, but Void reads `void.config.ts` from the
**project root**. For deployment, copy it to the repository root (see `studio/docs/DEPLOY.md`).
`studio/migrations/` are D1-compatible; for the SaaS backend, point Void's migration runner at them
(`db/migrations/`) — documented in `DEPLOY.md` and `SAAS-ROADMAP.md`.

## 7. New files & env

- New: `web/studio-api.js`, `web/studio-db.js`, `studio/src/lib/repo/select-adapter.js`,
  `studio/docs/DEPLOY.md`, `studio/docs/SAAS-ROADMAP.md`, `studio/README.md`, `studio/void.config.ts`,
  `test/studio-api.test.js`.
- Replaced: `studio/src/lib/repo/remote-adapter.js`, `studio/src/components/data/DataPanel.jsx`.
- `.gitignore` now ignores `web/.studio-token`.
- Env: `STUDIO_BRIDGE_TOKEN`, `STUDIO_ORIGINS`, `PROFESSOR_HOME`, `STUDIO_DB`,
  `STUDIO_MIGRATIONS_DIR`, `STUDIO_ALLOW_NON_LOOPBACK`, `OLLAMA_HOST`.
