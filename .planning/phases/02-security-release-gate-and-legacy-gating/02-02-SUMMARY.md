---
phase: 2
plan: 2
status: complete
requirements: [SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-11, SEC-13]
commits:
  - 9f99033 feat(02-02): compose Studio request guards from security helpers
  - c621e3b feat(02-02): make the Studio router side-effect free
  - c7641d6 feat(02-02): add side-effect-free app factory and entry point
  - ac5de8a feat(02-02): host-validate the Studio static server
---

# Plan 02-02 — Guard Composition, App Factory and Studio-only Entry: Execution Summary

## What was built

1. **One composed guard contract (`web/studio-api/guards.js`, Task 1).**
   - `installGuards(router, { getToken, token, origins, allowNonLoopback, extraHosts, jsonLimit })`
     now runs, in order: Host (raw header + loopback client address) → Origin/preflight → pairing
     token → JSON content-type → `express.json({ strict: true })` → body-parser error mapper.
   - Host uses `security.isAllowedHost` / `isLoopbackAddress`; a spoofed or missing Host is 403
     `forbidden_host`, a non-loopback client is 403 `forbidden_client` unless opted in.
   - Origin is an exact allowlist in default mode; `null` is always 403; wildcard mode echoes the
     exact non-null origin (never `*`) and sets `Vary: Origin`. Preflight is Host+Origin only and
     returns 204 with exact ACAO/methods/headers/private-network.
   - Token is read through `getToken()` on every request and compared with `timingSafeEqual`;
     OPTIONS is exempt.
   - Non-JSON state-changing requests are 415; parser errors map to 400 `invalid_json` /
     413 `payload_too_large` / 415 `unsupported_media_type`, never Express's HTML page.
   - `DEFAULT_ORIGINS` / `parseOrigins` are re-exported from `web/security.js`; new
     `buildOriginSet({ envValue, ownPort, legacyDev, studioPort })` owns the origin merge (D-28).

2. **Side-effect-free Studio composition (`web/studio-api.js`, Task 2).**
   - Removed the eager module-level `createStudioRouter({ announce: true })` block, `printBanner`,
     the `announce` option and every raw-token print path. The default export is a silent lazy
     handler.
   - `createStudioRouter` accepts `token` (back-compat), `getToken` (preferred),
     `allowNonLoopback` and `extraHosts`. A supplied token/getter is never written or regenerated.
   - `TOKEN_FILE` now derives from `security.tokenFilePath(process.env)` and is marked deprecated.
   - Every Phase 1 re-export and `createStudioApp` (synchronous, token-injectable) is preserved.

3. **`createApp` / `startServer` (`web/server.js`, Tasks 3–4).**
   - Importing the module performs no DB open, token write, directory creation, spawn, listen or
     logging. Module-level `console.log`, `mkdirSync(COURSES_DIR)`, `USE_CLI`, `cors()`, the global
     `express.json`, eager app/server, Vite spawn and eager `listen` are gone.
   - `createApp({ legacy, ... })` mounts: global Host guard → `/api/studio` (token-getter based) →
     optional legacy router (dynamic `web/legacy-server.js`, else `legacy_unavailable`) → `/api`
     404 JSON → exactly one UI at `/`:
       - Studio-only serves `studio/dist` (200/503 build instruction, never legacy),
       - legacy production serves injected `legacyDist`,
       - legacy dev serves no Studio UI on 3000 and points at `http://localhost:5173`.
   - Course helpers (`getCourses`, `getCourseFile`, `getExercises`, `getActiveExercise`,
     `saveCourseFile`, `saveFilesFromResponse`, `PROFESSOR_SYSTEM_PROMPT`) remain exported and now
     take an explicit `coursesDir`, ready for Plan 03.
   - `startServer` maps `PORT`/`HOST`/`COURSES_DIR`/`STUDIO_DIST`/`NODE_ENV`/`PROFESSOR_LEGACY`/
     `STUDIO_ORIGINS`, resolves the token with `ensureStudioToken` + `createTokenGetter`, derives
     `extraHosts`, refuses wildcard hosts, refuses `STUDIO_ORIGINS=*` +
     `STUDIO_ALLOW_NON_LOOPBACK` before bind (`insecure_config`), warns loudly for either escape
     hatch alone, writes the legacy deprecation warning to stderr only, prints a masked banner with
     a `#token=` pairing URL, and returns `{ app, server, token, origins, uiUrl, close }`.
   - The entry guard is null-safe (`process.argv[1]` checked) and exits non-zero on config/legacy
     errors.
   - `bin/commands/web.js` now starts via `startServer({ legacy, port, host })` and strips flags
     before positional port parsing.

4. **Host-validated Studio static server (`bin/commands/studio.js`, Task 6).**
   - New `createStudioStaticServer({ root, host, port, extraHosts })` parses the raw Host with
     `web/security.js` and answers 403 `forbidden_host` before delegating to
     `createStaticHandler` from the untouched `bin/static-server.js`.
   - `run()` derives `extraHosts` with the shared `security.resolveExtraHosts` and uses the wrapper;
     loopback bind, SPA fallback and shutdown behavior are unchanged.

## Files

- Changed: `web/studio-api/guards.js`, `web/studio-api.js`, `web/server.js`,
  `bin/commands/web.js`, `bin/commands/studio.js`
- New: `test/security/helpers/app.js`, `test/security/helpers/free-port.js`,
  `test/security/guards.test.js`, `test/security/entrypoints.test.js`,
  `test/security/studio-static.test.js`
- Untouched: `bin/static-server.js`, `studio/**`, `package.json`, lockfiles, migrations,
  `.planning/STATE.md`, `.planning/ROADMAP.md`, the pre-existing untracked `.planning/state.json`.

## Tests run and results

```text
npx vitest run test/security                         # 6 files, 121 tests passed
npx vitest run test/studio-api.test.js \
  test/studio-api-agents.test.js test/cli-studio.test.js
                                                     # 3 files, 98 tests passed
npx vitest run                                       # 20 files, 415 tests passed
node -e "...server exports createApp/startServer..." # ok
node -e "...Phase 1 studio-api re-export manifest..."# ok
node --check <every changed source/test file>        # ok
```

Coverage: full guard matrix (401/403/415/400/413, Host/Origin/`null`, wildcard echo, preflight,
ACAO never `*`, dynamic token rotation); Studio-only 404s through the real `node web/server.js`
entry (`/api/chat`, `/api/courses*`, `/api/agents/*`, `/api/notify`, `/src/main.jsx`); exactly one
Studio UI at `/`, `/index.html` and deep links (200/503); spoofed Host 403 on UI; legacy
`--legacy`/`PROFESSOR_LEGACY=1` deprecation + `legacy_unavailable`; combined escape-hatch refusal
without binding; wildcard-only warning; in-process rejection snapshot + zero spawn calls; Studio
static Host guard (spoofed/missing/loopback/extraHosts).

## Decisions honored

- **D-04/D-06/D-11..D-14/D-22/D-24:** one composed guard order, side-effect-free factory, exact
  origins, null rejection, token independent of Origin, no wildcard CORS, Studio-only default with
  API 404 before any SPA fallback.
- **D-07/D-08/D-09:** legacy is opt-in only; dev/prod UI split is explicit; deprecation warning on
  stderr.
- **D-12/D-23/D-28:** shared Host allowlist + `resolveExtraHosts`, getter-based token rotation,
  own-origin and legacy-dev 5173 merge.
- **D-27 handoff:** `package.json` was not edited.

## Deviations / notes

- `web/server.js`'s legacy route handlers/agent stream code were removed rather than left dead; they
  belong to Plan 03's `web/legacy-server.js` (the plan only requires the course helpers to survive).
  Legacy mode therefore fails with `legacy_unavailable` until Plan 03 lands, as specified.
- The Studio CLI token resolution/pairing URL (`resolveStudioToken`, `buildPairingUrl`) was left for
  Plan 05; this plan only threads `extraHosts` and the Host-validating static wrapper. The child
  still receives `STUDIO_BRIDGE_TOKEN`, so the new `startServer` works unchanged.
- `createStudioRouter`'s default logger is now silent (the banner moved to `startServer`); explicit
  `log` injection still works.
- Any non-empty `STUDIO_ALLOW_NON_LOOPBACK` counts as the opt-in so the refuse-on-combination check
  matches `resolveExtraHosts` (a hostname list is also an opt-in).
- Existing Phase 1 suites needed no changes: the router/app re-export surface and HTTP contract were
  preserved.

## Handoff notes

- Root `package.json` `files` (not owned by Phase 2, D-27) must gain `web/security.js` and
  `web/legacy-server.js`; Phase 4's tarball smoke must assert both are packed.
- `web/server.js` now depends on Plan 03's `web/legacy-server.js` for `legacy: true`. Until that
  merges, legacy mode must keep failing with `legacy_unavailable`, never a partially guarded server.
- Plan 03 Task 5 owns the legacy production/legacy-dev halves of the exactly-one-UI contract and the
  `uiUrl` 5173/3000 assertions; `createApp`/`startServer` already expose the hooks it needs.
