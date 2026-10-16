# Task brief: Phase 26 — Local Server, SQLite & Deploy

You implement one phase of milestone v3.0 **Professor Studio**. You work in your own git worktree branched from the
merged Phase 22 foundation. Phases 23–25 run IN PARALLEL in other worktrees; Phase 27 edits `web/server.js`
`saveFilesFromResponse`. So ONLY edit the files you own. Needed changes elsewhere go into `studio/HANDOFF-26.md`.
Commit on your branch in small conventional commits. Do NOT push.

Read first: /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/ROADMAP.md, /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/REQUIREMENTS.md, /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/research/ARCHITECTURE.md (§2 bridge, §4 security, SaaS path),
/Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/research/STACK.md (Q5 void.cloud), /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/research/PITFALLS.md (2, 3, 4, 8, 11, 15, 16, 18).
In your worktree read: `web/server.js` (existing CLI streaming helpers, getAgentCapabilities),
`studio/src/lib/repo/*` (StorageAdapter contract, schema.js, remote-adapter.js stub + its documented HTTP contract,
`test/adapter-contract.test.js`), `studio/src/lib/ai/bridge.js` (client side of the bridge contract — the server
MUST match it exactly: SSE `data: {"text":"..."}`, `data: {"error":"...","code":"..."}`, `data: [DONE]`),
`studio/migrations/0001_init.sql`, `studio/src/components/data/DataPanel.jsx` (stub).

## Requirements
AI-06, DATA-01, DATA-02, DATA-04, DATA-05, DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04.

## Files you own
- NEW `web/studio-api.js` (Express Router, ES module) + NEW `web/studio-db.js` (node:sqlite layer) +
  NEW `web/test/` or root `test/studio-api.test.js`
- `web/server.js`: exactly ONE import + ONE `app.use('/api/studio', studioRouter)` line placed BEFORE the blanket
  `app.use(cors())` handling for that path (do not touch anything else in server.js)
- `.gitignore`: add `web/.studio-token`
- `studio/src/lib/repo/remote-adapter.js` (replace stub), `studio/src/lib/repo/select-adapter.js` (new: auto-detect)
- `studio/src/components/data/*` (replace stub DataPanel; keep export name)
- `studio/docs/*`, `studio/README.md`, `studio/void.config.ts` (or `void.json`)

## Build
1. **studio-db.js** — `node:sqlite` `DatabaseSync` at `${PROFESSOR_HOME:-~/.professor}/professor.db` (mkdir -p).
   Migration runner: applies `studio/migrations/*.sql` in filename order, tracked in a `d1_migrations` table
   (`id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT`) — same table name wrangler uses, so the
   files are D1-compatible. Generic table CRUD implementing the StorageAdapter ops with parameterized SQL only; table
   and column names validated against the migration-defined schema (read via `sqlite_master`/`pragma_table_info` at
   startup — PRAGMA is fine server-side, just not inside migrations). JSON columns pass through as TEXT.
2. **studio-api.js** routes (all require `X-Studio-Token`, all CORS-restricted):
   - `GET /health` → `{ ok, version, agents: getAgentCapabilities-like {claude, opencode, cursor, ollama} }`
   - `POST /complete` → body `{ system, messages, agent?, model? }`; streams the bridge SSE format above.
     claude: spawn `claude --print --output-format stream-json --include-partial-messages --verbose --system-prompt <system>`
     with the flattened conversation (ARCHITECTURE §2 flattening) as the prompt; NO `--dangerously-skip-permissions`,
     no tools needed; parse `stream_event` text deltas. opencode / cursor-agent: flatten system+history into one prompt
     and reuse the existing streaming parsers from server.js by importing them only if they are exported — otherwise
     reimplement minimally inside studio-api.js (do not edit server.js). Kill the child process on client disconnect
     (`req.on('close')`).
   - `GET /db/health`, `POST /db` → the remote StorageAdapter contract.
   - CORS: allowlist from `STUDIO_ORIGINS` (comma-separated), default `http://localhost:5180,http://127.0.0.1:5180`;
     handle OPTIONS; `Access-Control-Allow-Headers: Content-Type, X-Studio-Token`; reply
     `Access-Control-Allow-Private-Network: true` on preflight when requested. Reject others with 403.
   - Pairing token: `STUDIO_BRIDGE_TOKEN` env or generated at startup (crypto.randomBytes), saved to
     `web/.studio-token` (0600), printed in the startup banner with the Studio URL hint.
3. **remote-adapter.js** + **select-adapter.js**: when settings have bridgeUrl+token and `/db/health` answers, use
   SQLite (remote adapter); else IndexedDB. Run `runAdapterContract` against the remote adapter in a test that boots
   the router on an ephemeral port with a temp DB.
4. **DataPanel** (Settings): storage status (SQLite path / IndexedDB, persistent?), "Export backup (JSON)" /
   "Restore backup", "Import browser data into SQLite" (DATA-05: idb exportAll → remote importAll, verify counts, then
   offer to keep or clear browser copy), per-course "Export COURSE.md" (uses `toCourseMarkdown` in lib/course.js,
   downloads `<slug>-COURSE.md`). Backups never include settings/keys (assert in a test).
5. **Docs**: `studio/README.md` (run locally: `cd studio && npm i && npm run dev`; local agent: `npx course-professor web` /
   `cd web && node server.js`, paste token; Ollama `OLLAMA_ORIGINS` per OS; LNA note), `studio/docs/DEPLOY.md`
   (void.cloud: `npm i -D void`, `void.config.ts` with `appType: 'spa'`/outputDir, `npx void deploy --dir studio/dist`,
   beta caveat + Cloudflare Pages/Netlify fallback; verify commands against https://void.cloud docs and mark anything
   unverified), `studio/docs/SAAS-ROADMAP.md` (DEPLOY-03 scope from REQUIREMENTS.md: Cloudflare Workers via Void,
   **D1** reusing `studio/migrations/` + `d1_migrations`, tenancy: single DB + `owner_id` vs DB-per-tenant with D1
   limits, Better Auth via `void/auth`, local→cloud import/sync using `updated_at`/`deleted_at`, managed-AI proxy
   + metering (Workers AI / Anthropic key held server-side), Stripe billing, Oboe parity roadmap incl. audio lessons;
   phased plan with risks). DEPLOY-01: confirm `npm run build` output works when opened from a static server
   (`npx vite preview`) and from a sub-path.

## Verify before reporting
1. Root `npm test` and `cd studio && npm test` pass (incl. adapter contract against remote + token/CORS rejection tests).
2. `cd studio && npm run build` passes.
3. Manual: start `node web/server.js`, curl `/api/studio/health` with and without token / with a bad Origin.
4. `git diff --stat <base>..HEAD` lists only files you own.
Final notify summary: commits, tests, verified vs unverified void.cloud steps, HANDOFF items.
