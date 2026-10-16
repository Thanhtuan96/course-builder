# Phase 1: Seams and Toolchain Prep - Context

**Gathered:** 2026-10-17
**Status:** Ready for planning
**Mode:** Interactive (discuss inline; decisions below are user-locked)

<domain>
## Phase Boundary

Split the two hotspot monoliths (`web/studio-api.js`, `bin/cli.js`) into modules and land every
milestone dependency in a single lockfile change — **with zero behavior change**. This phase exists
so Wave 1 phases (Security, Data, Evidence) can work in disjoint files without colliding.

In scope:
- `web/studio-api.js` → thin composition + `web/studio-api/{guards,bridge,db,runner,health,agents}.js`
- `bin/cli.js` `web` case → `bin/commands/web.js`
- Dependency install + `packageManager` pin across all four lockfiles
- New `test/migrations.test.js` (migration uniqueness / contiguity / released-content immutability)

Out of scope (other phases):
- Any behavior change to routes, guards, CLI output, or runner logic (Security = Phase 2, etc.)
- Adding SQL migrations or bumping any `DB_VERSION` (Phase 5 owns `0005_beta_loop.sql`)
- Test-runner / CI wiring (Phase 4), plugin drift (Phase 3)

</domain>

<decisions>
## Implementation Decisions

### studio-api module seams
- **D-01:** `web/studio-api.js` stays a **thin composition that re-exports EVERY current public
  symbol** (`createStudioRouter`, `createStudioApp`, `extractOpencodeText`, `extractClaudeText`,
  `parseOrigins`, `detectAgents`, `listAgentModels`, all `parse*Models`, `defaultAgentRunners`,
  `VERSION`, `DEFAULT_ORIGINS`, `STUDIO_URL_HINT`, `TOKEN_FILE`, `AGENT_*`, `flattenConversation`,
  `clampMessages`, `diagnoseAgentFailure`, `describeNoOutput`, `firstMeaningfulStderr`, `probeOllama`,
  `curatedAgentModels`, plus the default export) — so `web/server.js` and the existing test files
  (`test/studio-api.test.js`, `test/studio-api-agents.test.js`, `test/cli-studio.test.js`) need
  **zero import changes**. **Reversibility:** costly — every consumer imports from `web/studio-api.js`;
  changing the re-export surface later breaks tests and `web/server.js` (but is a code-only change).
- **D-02:** Module layout — `web/studio-api/agents.js` holds ALL agent spawn/runner code
  (`spawnClaude`, `spawnCursor`, `spawnOpencode`, `spawnGemini`, `spawnAntigravity`, `runOllama`,
  `runJsonCli`, `defaultAgentRunners`, stream/parser helpers). Phase 2 will add `buildAgentArgs` and
  the permission-flag denylist there. Remaining modules: `guards.js` (token/loopback/CORS + JSON
  body middleware), `bridge.js` (`/health`, `/agents/:agent/models`, `/complete` SSE), `db.js`
  (`/db/health`, `/db`), `health.js` (agent capability detection / model listing / probes). The
  runner mount (`/run` → `createRunnerRouter`) is composed in `web/studio-api.js`.
  **Reversibility:** reversible — internal file layout, no published contract.
- **D-03:** No behavior change anywhere in the split: identical middleware order, identical response
  shapes, identical status codes. This is a pure mechanical extraction.

### cli.js split scope
- **D-04:** Move **only the `web` case** body into `bin/commands/web.js`, keeping the same
  `run({ args, cwd, chalk, style })` delegation shape the other cases already use. Leave the registry
  cases (`courses`, `search`, `install`, `update`, `installed`, `remove`, `publish`) in `bin/cli.js`.
  **Reversibility:** reversible — `web` case can move back; no external contract.

### Dependency pins & placement
- **D-05:** Root `devDependencies`: add `supertest`, `@playwright/test`, and bump `vitest` to
  `^5.0.5`. **Reversibility:** reversible.
- **D-06:** Bump `express` to `^4.22.3` in **only the package.json files that already declare
  express** (root and `web/package.json`). Do not add express anywhere else.
  **Reversibility:** reversible.
- **D-07:** Add `zod` to `studio` **dependencies** (not devDependencies).
  **Reversibility:** costly — `studio/src/lib/beta/**` (Phase 5) will import it at runtime; removing
  it later breaks the beta report schema validation.
- **D-08:** Pin `packageManager` **exactly** to `npm@11.19.0` in the root `package.json`.
  **Reversibility:** reversible.
- **D-09:** All four lockfiles (`root`, `web/`, `web/client/`, `studio/`) must resolve with
  `npm ci` after the change. Phase 1 owns all four lockfiles for this milestone.

### Migration test mechanism
- **D-10:** New `test/migrations.test.js` asserts:
  (a) **uniqueness** — no two migrations share a filename prefix,
  (b) **contiguity** — numeric prefixes run `0001..NNNN` with no gaps,
  (c) **released-content immutability** — each released migration's SHA-256 matches a committed
  manifest at `test/fixtures/migrations.sha256.json`. Released = the migrations present at Phase 1
  time (`0001_init.sql`..`0004_capstone.sql`).
- **D-11:** Every newly released migration MUST be added to `test/fixtures/migrations.sha256.json`.
  Phase 5 (`0005_beta_loop.sql`) is responsible for adding its own entry when it lands.
  **Reversibility:** one-way — once a baseline hash is committed, any edit to a released migration
  fails CI (that is the intended contract; enforced by the QA-04 test).

### the agent's Discretion
- Exact internal function placement and named exports inside each new module, as long as the
  public surface in D-01 is preserved and behavior is identical.
- Whether to re-export via `export { x } from './studio-api/y.js'` or an explicit import/export list
  in `web/studio-api.js`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap / requirements
- `.planning/ROADMAP.md` § "Phase 1: Seams and Toolchain Prep" — goal, Owns/Touch points, success criteria
- `.planning/ROADMAP.md` § "Execution Rules" — ownership, migrations, lockfiles, hotspots, merge discipline
- `.planning/REQUIREMENTS.md` — QA-01, QA-04 (the two requirements this phase satisfies)
- `.planning/PROJECT.md` — project constraints and key decisions

### Codebase maps
- `.planning/codebase/ARCHITECTURE.md` — surfaces, layers, `createStudioRouter` mount, runner path
- `.planning/codebase/STACK.md` — current dependency/version inventory
- `.planning/codebase/TESTING.md` — root Vitest + Studio Vitest split, test conventions
- `.planning/codebase/CONVENTIONS.md` — ES modules, JSDoc, path handling, error handling

### Source of truth being split
- `web/studio-api.js` — the file being decomposed (1294 lines)
- `bin/cli.js` — the dispatcher whose `web` case moves out (966 lines)
- `web/studio-runner.js` — `createRunnerRouter` (unchanged; mounted by the composition)
- `web/studio-db.js` — `createStudioDb` / `StudioDbError` (unchanged; imported by `db.js`)
- `studio/migrations/0001_init.sql` … `0004_capstone.sql` — released migrations hashed by the new test

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bin/commands/{status,next,check,doctor,studio,review,import}.js` — `run({ args, cwd, chalk, style })`
  delegation pattern to copy for `bin/commands/web.js`.
- `web/studio-runner.js` `createRunnerRouter(options)` — mounted at `/run` inside the token guard;
  the composition module must keep that exact mount point and ordering.
- `vitest.config.js` (root) already includes `test/**/*.test.js`; the new migration test needs no
  config change.

### Established Patterns
- ES modules only in `bin/`, `web/`; JSDoc on exported functions; `path.join` for paths.
- `web/studio-api.js` is imported by `web/server.js` as the default export and by tests for named
  exports — the re-export surface (D-01) is the compatibility contract.
- Migrations are applied in filename order and tracked in a `d1_migrations` table; release files are
  never edited (QA-04).

### Integration Points
- `web/server.js` `app.use('/api/studio', studioRouter)` (default export) — must keep working.
- `test/studio-api.test.js`, `test/studio-api-agents.test.js`, `test/cli-studio.test.js` import from
  `web/studio-api.js` — must keep working unmodified.
- `package.json` `files` allowlist ships `web/studio-api.js` explicitly — the new `web/studio-api/`
  directory must be added to `files` (and to `scripts/smoke-pack.mjs` expectations if present).

</code_context>

<specifics>
## Specific Ideas

- Keep the top-of-file explanatory comment in `web/studio-api.js` (bridge / database / safety
  concerns) and point it at the new modules.
- The `web` case delegation must preserve every flag: `--production`, `--cloud`, positional port,
  `PORT`, `COURSES_DIR`, `NODE_ENV`, and the `await import(join(webDir, 'server.js'))` handoff.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Runner allowlist hardening, flag denylist, and guard
behavior changes belong to Phase 2; the `web` case's security posture belongs to Phase 2 as well.)

</deferred>

---

*Phase: 1-Seams and Toolchain Prep*
*Context gathered: 2026-10-17*
