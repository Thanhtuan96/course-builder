# Phase 2: Security Release Gate and Legacy Gating - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning
**Mode:** Interactive (orchestrator decisions locked; remaining details at agent discretion)

<domain>
## Phase Boundary

Make the local product safe to ship for beta:

- **One guard layer for every API route.** Studio and legacy requests are rejected unless the
  `Host` is an allowlisted loopback host, the `Origin` is an exact allowlist member (or absent),
  the pairing token is valid, and state-changing bodies are JSON.
- **Studio-only by default.** `course-professor web`, `npm start` and `node web/server.js` mount
  Studio only. The legacy client and its routes (`/api/chat`, `/api/courses`, …) return 404 unless
  legacy mode is explicitly enabled. Legacy mode prints a deprecation warning on every start and
  the legacy UI shows a persistent banner pointing at Studio.
- **Safe spawning and running.** No agent CLI ever receives a permission-bypass flag or env; all
  agents run shell-less in a fresh temp cwd with a scrubbed environment. The learner runner keeps
  an allowlist, Bash off by default, and a small concurrency cap.
- **Token hygiene.** The pairing token lives under `~/.professor/`, is mode 0600 after every write,
  is masked in the banner, reaches browsers only via a `#token=` fragment, and can be rotated.
- **Traversal is closed.** Course slugs, exercise filenames and workspace paths cannot escape their
  root through encoded, backslash or symlink variants.
- **A security regression suite** drives every entry point and proves rejected requests caused no
  side effect (no file written, no process spawned).
- **CONCERNS.md triage.** All high/medium security findings in Phase-2-owned files are fixed; only
  registry install integrity is accepted for beta (written note). Out-of-ownership findings are
  mapped to their owning phase, not silently accepted.

Out of scope (owned by other phases, do not edit): CSP/BYOK/loopback-bridge client work and Studio
`settings.js` pairing reader (Phase 6); `0005_beta_loop.sql` / migrations / schema version (Phase 5);
`npm test`/CI wiring and root `package.json` scripts (Phase 4); plugin drift (Phase 3); product docs
and `init` routing (Phase 11).

</domain>

<decisions>
## Implementation Decisions

### Token storage, delivery, rotation
- **D-01:** The pairing token is stored at `~/.professor/studio-token` (override root with
  `PROFESSOR_HOME`). Resolution order: `STUDIO_BRIDGE_TOKEN` env → existing token file → newly
  generated 24-byte hex token. Every write re-applies mode `0600` (chmod after write, not only at
  create). **Reversibility:** costly — every entry point (`web`, `studio`, `doctor`, tests) reads
  this one helper; moving it later breaks saved pairings.
- **D-02:** A legacy `web/.studio-token` is migrated once into `~/.professor/studio-token` (only
  when no token file exists and no env override is set), then the legacy file is deleted.
  **Reversibility:** one-way — deleting the legacy file means a downgrade would require re-pairing.
- **D-03:** The browser receives the token only through the `#token=<value>` fragment (the Phase 6
  contract). The pairing URL is `<studio-url>/#token=<value>`; when the API port is non-default it
  also carries `&bridge=<urlencoded apiUrl>` inside the same fragment. Never a URL query string.
  **Reversibility:** one-way — Phase 6's `settings.js` reader depends on this fragment format.
- **D-04:** Static Studio assets (`studio/dist`) stay public: they contain no secrets and the HTML
  must load before any token exists. **Every API route** — Studio bridge, DB, runner, and all
  legacy routes — requires the token, including requests with no `Origin` header.
- **D-05:** The startup banner masks the token (e.g. first/last four characters) and prints the
  pairing URL; it never prints the full token as a standalone value. `--rotate-token` writes a new
  token (mode 0600), invalidates the old one immediately, and prints the new pairing URL.
  **Reversibility:** reversible.

### Legacy gating and entry points
- **D-06:** `web/server.js` becomes a side-effect-free module exporting `createApp({ legacy })` and
  only starts listening when it is the process entry point. `npm start` and
  `node web/server.js` keep working and default to Studio-only.
- **D-07:** Legacy mode is enabled by `--legacy` (CLI) or `PROFESSOR_LEGACY=1`. When disabled,
  `/api/chat`, `/api/courses`, `/api/agents/*`, `/api/notify` and the legacy client all return
  404. When enabled, legacy routes mount on the same server behind the same guard layer.
- **D-08:** The legacy Vite dev server is spawned only in legacy mode and only outside production;
  production legacy mode serves `web/client/dist`. Studio-only mode never spawns Vite.
- **D-09:** Every legacy start writes a deprecation warning to **stderr** (not stdout) and the
  legacy React client shows a persistent banner linking to `http://localhost:5180`.
  **Reversibility:** reversible.
- **D-10:** Legacy path handling is centralized: slug `/^[a-z0-9][a-z0-9-]*$/`, filenames matched
  against the four known course files, and every resolved path asserted under its root (read and
  write). LLM `<file path="courses/<slug>/...">` writes are only honored for the course being
  chatted about. **Reversibility:** costly — the legacy client relies on these routes while the
  deprecation window is open.

### Guard policy
- **D-11:** Guard order is **Host → Origin → token → JSON content-type → handler**. `Host` rejects
  with 403, `Origin` with 403, missing/invalid token with 401, non-JSON state-changing requests
  with 415. No wildcard CORS ever.
- **D-12:** Host allowlist: `localhost`, `127.0.0.1`, `[::1]` (any port). The client-address
  loopback check stays. When `STUDIO_ALLOW_NON_LOOPBACK` is set, the Host check is relaxed for the
  explicitly opt-in non-loopback host after a loud warning. `STUDIO_ORIGINS=*` alone is allowed
  with a loud warning; `STUDIO_ORIGINS=*` **together with** `STUDIO_ALLOW_NON_LOOPBACK` is refused
  with a non-zero exit before the server binds.
- **D-13:** The exact origin allowlist defaults to `http://localhost:5180,http://127.0.0.1:5180`.
  A request with no `Origin` is still subject to the token guard; it is not treated as trusted.
- **D-14:** `web/security.js` is the single home for host/origin/token/JSON helpers, safe path
  resolution, and token file operations. `web/studio-api/guards.js` composes it and re-exports
  `DEFAULT_ORIGINS`/`parseOrigins` so existing importers keep working.

### Agent and runner hardening
- **D-15:** All agent CLI spawns use `shell: false`, a fresh temp cwd (including Claude, which
  currently runs in `web/`), and an **allowlisted** environment (PATH/HOME/USER/SHELL/TMPDIR/LANG/
  TERM/OS essentials plus the specific provider credentials each CLI needs). No
  `--dangerously-skip-permissions`, `--yolo`, `--trust`, `bypassPermissions`,
  `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` or equivalents; a deny check runs on every built argv and
  env before spawn.
- **D-16:** Windows `.cmd`/`.bat` agent shims are documented as unsupported for beta: a clear
  error is returned instead of an opaque spawn failure, and `doctor` reports it.
- **D-17:** The learner runner keeps its language→command allowlist, rejects `npm`, `npx`,
  `playwright`, `sh`/`bash` commands, keeps Bash off unless `PROFESSOR_ALLOW_BASH=1`, and caps
  concurrent runs at **2** (configurable `PROFESSOR_MAX_RUNS`, 1–8). A saturated server answers
  `429` with a retry hint before writing files or spawning anything.
- **D-18:** Learner-run child processes also get a scrubbed env (no API keys/tokens), in addition
  to `shell: false`, temp/workdir containment and the existing timeout/output caps.

### Triage and tests
- **D-19:** `docs/security/ACCEPTED-RISKS.md` accepts only **community registry install integrity**
  (no signature/checksum) for beta, with the reason and revisit trigger. Every other high/medium
  CONCERNS security finding in a Phase-2-owned file is fixed (legacy unauth/CORS/chat spawn, path
  traversal, LLM file writes, Claude cwd, token mode/banner/rotation, escape-hatch warnings,
  `validateItemName('..')`, runner concurrency). Findings in files owned by other phases are listed
  with their owning phase (CSP/BYOK → 6, schema version → 5, Studio CI → 4, drift → 3, worker/Pyodide
  isolation → post-beta), not accepted. **Reversibility:** reversible.
- **D-20:** `test/security/**` drives the composed app through `course-professor web`,
  `npm start`/`node web/server.js`, and direct router construction. Rejection tests snapshot a temp
  data directory and spy on `child_process.spawn` to prove no file was written and no process was
  spawned. Existing `test/studio-api*.test.js`, `test/studio-runner.test.js`,
  `test/cli-studio.test.js` and `test/cli.test.js` cases are updated only where this phase changes
  the contract.
- **D-21:** Root `package.json` scripts and CI are untouched (Phase 4 owns them); tests are runnable
  via `npx vitest run test/security` and the existing root suite.

### Research resolutions (agent defaults, recorded not re-asked)
- **D-22:** `STUDIO_ORIGINS=*` never emits `Access-Control-Allow-Origin: *`: it echoes the exact
  request origin after rejecting `null`, prints a loud warning, and is reported by `doctor`. This
  keeps SEC-04's "no wildcard CORS" true while honoring D-12's escape hatch.
- **D-23:** `--rotate-token` invalidates immediately for a running server: the guard reads the
  token through a `getToken()` callback with an mtime/size cache, not a startup-frozen string.
  Rotation is refused when `STUDIO_BRIDGE_TOKEN` is set (env tokens cannot be rotated).
- **D-24:** `createApp({ legacy })` serves `studio/dist` when present (public assets + Studio SPA
  fallback for GET/HEAD), but mounts an API 404 before the SPA fallback so `/api/*` never returns
  HTML. If `studio/dist` is missing, it returns a short HTML/JSON message telling the user to run
  `course-professor studio` (or build Studio); it never falls back to the legacy client.
- **D-25:** Legacy LLM `<file>` writes are scoped to the current course. When no current slug exists
  (`professor:new-topic`), one non-existent course slug is allowed and adopted for the rest of the
  response; an existing *different* course is never written.
- **D-26:** `doctor` uses the shared token helper to send `X-Studio-Token` to `/api/studio/health`;
  a 401 is reported as "server reachable but unpaired", not as a failure.
- **D-27:** Root `package.json`'s `files` list omits the new `web/security.js` and
  `web/legacy-server.js`. Phase 2 must NOT edit `package.json` (not owned). The plan records a
  handoff note for the orchestrator/Phase 4 tarball smoke; `scripts/smoke-pack.mjs` is Phase 4's
  file.
- **D-28:** In legacy dev mode, `http://localhost:5173` and `http://127.0.0.1:5173` are added to the
  exact origin allowlist (Vite's default); no other implicit origins.
- **D-29:** The legacy client's token-bearing chat call becomes a `fetch` POST with
  `X-Studio-Token` (native `EventSource` cannot set headers); the token is read from `#token=`,
  kept in `sessionStorage`, and scrubbed from the URL. A persistent deprecation banner is rendered
  above the app shell.

### the agent's Discretion
- Exact helper names/module boundaries inside `web/security.js`, `web/legacy-server.js` and
  `web/studio-api/*`, provided the public re-export surface in `web/studio-api.js` is preserved.
- Exact mask format, warning wording, and the retry hint text.
- Whether legacy client token retrieval uses `sessionStorage` after reading `#token=`, as long as
  it is never a query string and never `localStorage` for the token.
- Test file granularity inside `test/security/**` and fixture layout.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and roadmap
- `.planning/ROADMAP.md` § "Phase 2: Security Release Gate and Legacy Gating" — goal, Owns, Touch
  points, success criteria, research flag
- `.planning/ROADMAP.md` § "Execution Rules" — exclusive ownership, no new migrations, lockfiles,
  hotspots, merge discipline
- `.planning/REQUIREMENTS.md` — SEC-01..SEC-11, SEC-13, SEC-14 (SEC-12 is Phase 6)
- `.planning/PROJECT.md` — product constraints and key decisions
- `.planning/codebase/CONCERNS.md` — the findings being fixed or triaged (security + tech debt)
- `.planning/phases/01-seams-and-toolchain-prep/01-CONTEXT.md` — D-01/D-02 re-export surface and
  module seams that Phase 2 must preserve

### Current security-relevant source
- `web/server.js` — unauthenticated legacy server, `cors()`, `/api/chat` bypass spawn, traversal
- `web/studio-api.js` — composition, token resolution/banner, guard mount
- `web/studio-api/guards.js` — current token/loopback/CORS implementation
- `web/studio-api/agents.js` — agent argv/env/spawn (Claude cwd, OpenCode permissions)
- `web/studio-api/bridge.js` — `/complete` SSE and agent selection
- `web/studio-runner.js` — runner allowlist, path containment, spawn env
- `web/studio-db.js` — DB opened under `~/.professor/`
- `bin/commands/web.js` — `course-professor web` entry
- `bin/commands/studio.js` — pairing URL, token resolution, static Studio server
- `bin/commands/doctor.js` — environment checks to extend with security posture
- `bin/registry-helpers.js` — `validateItemName` (the `..` gap)
- `bin/static-server.js` — static Studio serving (read-only reference; not owned)
- `bin/cli.js` § `case 'web'` — delegation/flag parsing only
- `web/client/src/api/client.js`, `web/client/src/App.jsx` — legacy token header + banner

### Tests and conventions
- `test/studio-api.test.js`, `test/studio-api-agents.test.js`, `test/studio-runner.test.js`,
  `test/cli-studio.test.js`, `test/cli.test.js` — contracts this phase updates
- `.planning/codebase/TESTING.md` — root Vitest conventions
- `.planning/codebase/CONVENTIONS.md` — ES modules, JSDoc, `path.join`, error handling

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/studio-api/guards.js` already has `timingSafeEqual` token compare, `isLoopback`, CORS
  allowlist and preflight handling — extend it rather than duplicating.
- `web/studio-runner.js` already exports `isSafeRelPath`, `isSafeSlug`, `buildPipeline`,
  `commandExists`, `killTree`; add `COMMAND_DENYLIST`, env scrubbing and the concurrency semaphore.
- `web/studio-api/agents.js` already uses `makeTempCwd`, `runJsonCli`, `shell:false`; add
  `buildAgentArgs`/`assertSafeAgentInvocation` and use the temp cwd + scrubbed env for Claude too.
- `bin/commands/studio.js` has `stripAgentEnv`, `mergeOrigins`, `resolveStudioToken`,
  `buildPairingUrl` — align the token helper with `web/security.js` and change the fragment.
- `bin/commands/doctor.js` has `whichPath`, `httpGet`, `summarizeChecks` — reuse for posture checks.
- Phase 1's re-export surface in `web/studio-api.js` is the compatibility contract.

### Established Patterns
- ES modules everywhere in `web/` and `bin/`; JSDoc on exported functions; `path.join`/`resolve`.
- Guards are Express middleware mounted before body parsing/routes, in a fixed order.
- Tests boot real HTTP servers on ephemeral ports with injected DB/runners; prefer `fetch` and
  `supertest` (installed in Phase 1).
- Legacy server is a single 1,222-line module; extract only what Phase 2 owns (`createApp`,
  legacy router, path helpers, spawn helpers).

### Integration Points
- `web/server.js` is imported by `bin/commands/web.js`, `bin/commands/studio.js` (spawns it), and
  `test/cli-studio.test.js`; keep `export { app, server }`-style compatibility where reasonable.
- `web/studio-api.js` is imported by `web/server.js` and all Studio tests; keep named re-exports.
- `studio/src/lib/settings.js` (Phase 6) will read `#token=`; do not edit it here.
- `bin/static-server.js` serves `studio/dist`; keep static assets public and do not edit it.

</code_context>

<specifics>
## Specific Ideas

- Treat the guard layer as a single contract tested once and reused by both apps, so a future route
  cannot be added without the guard.
- Side-effect assertions are first-class: rejected requests must demonstrably not create files or
  spawn processes, not merely return the right status code.
- Keep the beta escape hatches (`STUDIO_ORIGINS=*`, `STUDIO_ALLOW_NON_LOOPBACK`,
  `PROFESSOR_ALLOW_BASH`) but make them loud and non-combinable.
- `docs/security/ACCEPTED-RISKS.md` should read like a security note, not a TODO list.

</specifics>

<deferred>
## Deferred Ideas

- CSP, BYOK key protection, render-safe language switch, Studio-side `#token=` reader, and
  loopback-only bridge URL validation belong to Phase 6.
- Schema version from migrations and snapshot columns belong to Phase 5.
- Running the Studio suite in `npm test`/CI belongs to Phase 4.
- Opaque-origin sandbox for learner code and SRI for Pyodide are post-beta hardening; they touch
  files outside Phase 2's ownership.
- `STUDIO_ORIGINS` per-origin persistence and a UI for token rotation are nice-to-have follow-ups.

### Reviewed Todos (not folded)
None — `todo.match-phase` returned no matches for Phase 2.

</deferred>

---

*Phase: 2-Security Release Gate and Legacy Gating*
*Context gathered: 2026-10-22*
