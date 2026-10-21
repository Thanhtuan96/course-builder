---
phase: 2
plan: 3
status: complete
requirements: [SEC-01, SEC-08, SEC-09, SEC-13]
commits:
  - eb72a7d feat(02-03): add guarded legacy server and wire legacy mode
  - 6229a56 test(02-03): cover legacy guards, traversal, scoping, agents and UI split
---

# Plan 02-03 — Legacy Server Extraction and Gating: Execution Summary

## What was built

### 1. `web/legacy-server.js` (new, the only home of legacy routes)

- `createLegacyRouter({ coursesDir, getToken, ... })` builds an Express Router and refuses to
  construct without `coursesDir` and a `getToken` function. Routes are mounted on a nested `/api`
  router so `installGuards` guards only `/api/*` and never the legacy UI/assets (D-04/D-11).
- Moved routes: `GET /api/courses`, `GET /api/courses/:slug/exercises`,
  `GET /api/courses/:slug/exercises/:filename`, `GET /api/courses/:slug/:file`,
  `POST` course/exercise writes, `GET /api/agents/capabilities`, `GET /api/agents/models`,
  `POST /api/chat`, `POST /api/notify`.
- No `cors()`, no global `express.json`; all parsing and 415/400/413 behavior comes from
  `studio-api/guards.js`.
- `GET /api/notify` (POST) returns the legacy `{ success: true, message: 'Notification sent' }`
  shape and is 404 when legacy is off.
- Course helpers moved out of `web/server.js`: `getCourses`, `getCourseFile`, `saveCourseFile`,
  `getExercises`, `getActiveExercise`, `saveFilesFromResponse` and `PROFESSOR_SYSTEM_PROMPT` now
  live in this module and take an explicit courses root.
- Every read/write path uses the exact allowlists (`isSafeSlug`, `isSafeCourseFile`,
  `isSafeExerciseFilename`) plus `security.resolveInside`; symlinks are checked with `lstat` on the
  course dir, `COURSE.md`, exercise files/dirs and the `lectures` archive dir.

### 2. Legacy write containment

- `getCourses` skips a symlinked course directory and never reads a symlinked `COURSE.md` for
  metadata; `getExercises` skips symlinked exercise files and a symlinked `exercises` dir.
- `saveCourseFile`/`saveExerciseFile` reject a symlinked course/exercise/lecture path with 403
  `unsafe_path` before any mkdir, then write through `security.safeWriteFile` (containment,
  `O_NOFOLLOW`).
- LECTURE archiving validates `<course>/lectures` with `resolveInside`/realpath first; a symlink (or
  anything resolving outside the course root) rejects with 403 and `archiveLecture` is not called.
  `web/lecture-archive.js` was not edited.
- `saveFilesFromResponse` is scoped to the current slug (bare and `courses/<slug>/…` only). With no
  current slug it adopts exactly one brand-new slug; a second slug or any pre-existing course is
  skipped. Traversal and invalid filenames are skipped per block.

### 3. Legacy agents, capability cache and Vite

- `createLegacyAgentRunners({ extraEnv })` delegates to Plan 04's `defaultAgentRunners`, so legacy
  chat inherits shell-less spawn, temp cwd, allowlisted env and the pre-spawn argv assertion. No
  `--dangerously-skip-permissions`, `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS`, `--trust`, `--force`,
  `--yolo` or `--auto` path survives. OpenCode gets the server-built deny profile.
- `legacyAgentArgs` delegates to `buildAgentArgs`; the legacy SSE `{content}`/`{provider}`/
  `filesUpdated`/`[DONE]` shape and the cloud API-key fallback are preserved.
- `createCapabilityCache({ ttlMs = 30000, now, probe })` returns `{ get(), invalidate(), size }`
  with per-key in-flight dedupe. Both capability and per-provider model probes go through it, and
  the default probe uses the shared shell-less `detectAgents`/`listAgentModels` (no `execSync`).
- `startLegacyDevServer({ clientDir, spawnImpl, platform, log })` spawns `npm run dev` with
  `shell: false` in `web/client`; on Windows it returns `unsupported_windows_shim` without spawning.

### 4. `web/server.js`

- `createApp({ legacy: true })` dynamically imports `web/legacy-server.js` and mounts the router;
  it also passes `token`/`getToken`, `useCli`, injected `legacyRunners`, `capabilityCache` and
  `spawnImpl`.
- `startServer` resolves `claudeCLIAvailable()` once via the dynamic import (no shell at import
  time), threads `spawnImpl`/`platform` into `startLegacyDevServer`, spawns Vite only in legacy dev,
  kills it on close, and still reports `uiUrl` 5173 for legacy dev / the bound port otherwise.
- Legacy production serves injected `legacyDist` (startServer accepts `LEGACY_DIST` as a test seam);
  legacy dev serves no Studio index on 3000; Studio-only is unchanged.
- The deprecation warning remains on stderr for every legacy start.

## Files

- New: `web/legacy-server.js`, `test/security/legacy.test.js`,
  `test/security/legacy-agents.test.js`, `test/security/helpers/legacy.js`
- Changed: `web/server.js`, `test/security/entrypoints.test.js`
- Untouched: `.planning/STATE.md`, `.planning/ROADMAP.md`, `package.json`, lockfiles, `studio/**`,
  `bin/static-server.js`, `web/lecture-archive.js`, migrations, `bin/commands/web.js`.

## Tests run and results

```text
npx vitest run test/security/legacy.test.js test/security/legacy-agents.test.js   # 27 passed
npx vitest run test/security                                                      # 10 files, 171 passed
npx vitest run test/studio-api.test.js test/studio-api-agents.test.js \
  test/studio-runner.test.js test/cli-studio.test.js test/cli.test.js             # 5 files, 176 passed
npx vitest run                                                                     # 24 files, 465 passed
node --check <every changed source/test file>                                      # ok
```

Coverage: legacy mount/404 matrix; Host/Origin/token/JSON parity; encoded/backslash/absolute/
drive-letter/UNC/double-encoded traversal on read and write; symlinked course dir, `COURSE.md`,
exercise file, exercise dir and `lectures` dir; snapshot + spawn-spy no-side-effect assertions;
LLM cross-course overwrite rejection and one-slug adoption; capability/model TTL (one probe inside
30 s, second after expiry) and source assertion that neither legacy nor health uses `execSync`;
fake-agent capture (no deny token, `professor-*` temp cwd removed, scrubbed env, credentials kept,
OpenCode deny profile, no production capture); legacy SSE `{content}`; Vite spawn contract and
Windows shim; subprocess legacy production marker/warning and legacy-dev 5173/no-Studio-index.

## Decisions honored

- **D-04/D-11/D-13:** legacy API routes use the composed Host → Origin → token → JSON guards; UI
  assets stay unguarded; no wildcard CORS.
- **D-07/D-08/D-09:** legacy is opt-in, Vite only in legacy dev, legacy production serves the legacy
  dist, and every legacy start warns on stderr.
- **D-10/D-25:** exact slug/file allowlists, realpath/symlink containment for reads and writes, and
  current-course LLM write scoping with single-slug adoption.
- **D-15/D-16:** every legacy agent inherits Plan 04's shell-less, allowlisted, temp-cwd runners and
  the Windows shim error; legacy Vite never uses a shell.
- **D-27:** `package.json` was not edited.

## Deviations / notes

- `LEGACY_DIST` is accepted by `startServer` as an env seam so the subprocess legacy-production test
  can inject a dist marker without writing into the repository. `createApp` still takes the explicit
  `legacyDist` option first.
- The legacy chat no longer forwards `sessionId`/`--resume`; Plan 04's hardened one-shot runner is
  the single invocation path. The client-visible SSE contract is unchanged.
- The entrypoints legacy-dev case runs the real entry with a fake `npm` first on `PATH`, so the 5173
  contract is proved without starting Vite or binding a fixed port.
- Course helper exports were moved (not duplicated) from `web/server.js`; no in-repo importer
  depended on the old re-export surface.

## Handoff notes

- Root `package.json` `files` (not owned by Phase 2, D-27) still needs `web/security.js` and now
  `web/legacy-server.js`; Phase 4's `scripts/smoke-pack.mjs` must assert both are packed.
- The legacy React client banner and `X-Studio-Token` header work remains Plan 05's scope; this plan
  guarantees the server contract only.
