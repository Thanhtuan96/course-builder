# Phase 4: Test Entry and CI Baseline - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning
**Mode:** Interactive (discuss inline; decisions below are user-locked)

<domain>
## Phase Boundary

Make one deterministic command run every test suite and put a `develop`-gated CI baseline in place so
every later Wave 1–3 merge is checked automatically.

In scope:
- Root `npm test` running the root + Studio suites with one combined count (Vitest 5 `test.projects`).
- `test:watch`, `test:security`, `test:drift` scripts.
- New `.github/workflows/ci.yml` (unit, security, drift) and `develop` triggers for the existing
  `release-smoke.yml` (tarball smoke + Node 18 CLI floor).
- `scripts/smoke-pack.mjs` asserting the Phase 2 security files are packed and `.studio-token` is not.
- The QA-05 import-test timeout: remove real npm/network from the test path, stress-reproduce, and fix
  at the root without raising `testTimeout`.
- Package cleanliness needed to make the smoke assertion true (see D-02 exception).

Out of scope:
- Adding/altering dependencies or lockfiles (Phase 1 owns all four; Phase 4 may not add deps).
- Security route work, `web/security.js`, `web/legacy-server.js`, `test/security/**` (Phase 2).
- Drift script / `shared/**` / `test/shared-drift.test.js` (Phase 3).
- Any migration, `DB_VERSION`, or Studio source behavior.
- E2E/Playwright jobs (Phase 12), coverage tooling, and `CLAUDE.md` (orchestrator only).

</domain>

<decisions>
## Implementation Decisions

### Unified test entry
- **D-01:** Use Vitest 5 `test.projects` in root `vitest.config.js`, with two node-environment
  projects: `root` (`root: '.'`, `include: ['test/**/*.test.js']`) and `studio` (`root: './studio'`,
  `include: ['test/**/*.test.js']`). One `vitest run` produces one combined summary (verified today:
  57 files / 666 tests) and one exit code. The documented fallback is
  `vitest run && npm --prefix studio test`, used only if projects prove impossible in CI.
  — **Reversibility:** reversible — config-only change.
- **D-02:** Root scripts become: `"test": "vitest run"`, `"test:watch": "vitest"`,
  `"test:security": "vitest run test/security --project root"`,
  `"test:drift": "vitest run test/shared-drift.test.js --project root"`. The existing bare `vitest`
  moves to `test:watch` so CI can never hang in watch mode. `test:security`/`test:drift` hard-fail
  while their suites are absent; no `--passWithNoTests`.
- **D-03:** Remove the network `pretest` (`npm --prefix web install`). Replace it with a fast,
  offline dependency guard that imports the web/Studio modules root tests need and prints an
  actionable `npm ci` message on failure. CI installs every needed package root explicitly with
  `npm ci`; the test path itself never installs, builds, or fetches.
  — **Reversibility:** reversible — scripts-only.
- **D-04:** Do not raise `testTimeout`/`hookTimeout`. Keep Vitest defaults (5000 ms) so slow imports
  surface instead of being hidden.

### CI topology
- **D-05:** Add `.github/workflows/ci.yml` for `push` and `pull_request` to `develop` and `main`,
  with `permissions: contents: read` and `concurrency` (`cancel-in-progress: true`).
  Jobs: `unit`, `security`, `drift`. Every job sets `timeout-minutes`.
- **D-06 (revised after research):** `unit` matrix: Node 22 and Node 24 both run the full
  `npm test` (root + Studio). The original Node 20 Studio-only entry was disproven: Vitest 5 declares
  `engines.node ^22.12 || ^24 || >=26`, and `studio/test/agent-parsers.test.js` imports
  `web/studio-api.js` → `web/studio-db.js` → `node:sqlite`, so 1/43 Studio files fails on Node 20.
  Node 24 keeps a second honest runtime without a knowingly-red job. The Node 18 CLI floor stays in
  `release-smoke.yml`.
- **D-07:** Do not duplicate tarball smoke in `ci.yml`. Add `develop` to `release-smoke.yml` push
  triggers (keeping `main`); its existing `pull_request` trigger already covers PRs. That workflow
  keeps `tarball-smoke` (Node 22) and `cli-floor` (Node 18) with `timeout-minutes` added if missing.
- **D-08:** CI always uses `npm ci`, with `actions/setup-node@v4` npm caching and a
  `cache-dependency-path` covering the four lockfiles. The tarball job installs
  root/web/web-client/studio with `npm ci`, builds directly, then runs
  `SMOKE_SKIP_BUILD=1 npm run smoke:pack` so the smoke script itself performs no installs in CI.
- **D-09:** `security` and `drift` jobs run `npm run test:security` / `npm run test:drift` on Node 22
  and are expected to stay red until Phases 2 and 3 merge. Phase 4 is merged after them; VERIFICATION
  records this dependency explicitly. This is intentional, not flakiness.

### Not-yet-merged suites and tarball assertions
- **D-10:** `scripts/smoke-pack.mjs` hard-asserts, from the `npm pack --json` file list, that
  `web/security.js` and `web/legacy-server.js` are present and that no packed basename is
  `.studio-token`. Packlist paths are repo-relative (`web/...`), not `package/web/...`; normalize the
  JSON root (array or object) before reading. It fails loudly if either security file is missing.
- **D-11:** To make D-10 true, Phase 4 adds `web/security.js` and `web/legacy-server.js` to root
  `package.json` `files`, next to `web/server.js`. This is the only exception to the "scripts only"
  ownership: it is a packaging consequence of this phase's own success criterion and was explicitly
  approved during discuss. Phase 2 still owns the file contents. Mark this exception in VERIFICATION.
  — **Reversibility:** reversible — two allowlist lines; removing them only changes the package.
- **D-15:** The packlist assertion is an exported function (or otherwise invocable without running the
  full smoke) so it can be proven against synthetic packlists now: missing `web/security.js`,
  missing `web/legacy-server.js`, leaked `.studio-token`, and a good case. The real tarball smoke is
  run after Phase 2 merges/rebases and is recorded in VERIFICATION as a dependency, not skipped
  silently. Do not stub the missing Phase 2 files into the tree.

### QA-05 import-test timeout
- **D-12:** Treat the 5-second timeout as a real defect until disproven. Steps: (1) remove the real
  `npm`/network step from `pretest` and the test path (D-03); (2) stress-run the import/studio tests
  at least 30 times and under a constrained pool; (3) if it reproduces, fix the slow import/clock/fs
  at its source in the owned `test/cli-import*.test.js` (shared store or injected clock/fs, no real
  npm/build); (4) if it does not reproduce after both, record the exact commands/counts and the
  remaining deterministic guarantees in VERIFICATION instead of changing timeouts.
  — **Reversibility:** reversible — test/scripts-only.
- **D-13:** Keep test inputs pinned: explicit `today`/`now` values and temp-dir files; no reliance on
  the wall clock, the developer's Home directory, or network. Any new test affordance should make the
  suite more deterministic, not just faster.
- **D-14:** No new dependencies, no lockfile edits, no migrations, and no `DB_VERSION` changes in
  this phase. If a dependency seems necessary, stop and hand it to the orchestrator.

### the agent's Discretion
- Exact project names, reporter flags, cache keys, job/step names, and whether `unit` is one matrix
  job or two jobs with equivalent coverage.
- Exact wording of the offline dependency guard and of CI/VERIFICATION dependency notes.
- Whether `release-smoke.yml` keeps the stale `feat/studio-local-first` push trigger (keeping it is
  acceptable; replacing it with `develop` is preferred if it removes noise without losing coverage).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase contract
- `.planning/ROADMAP.md` § "Phase 4: Test Entry and CI Baseline" — owns list, touch points,
  success criteria, and the migration/lockfile/hotspot execution rules.
- `.planning/REQUIREMENTS.md` § "Quality / QA" — QA-02, QA-03, QA-05 (and QA-01/QA-04 context).
- `.planning/PROJECT.md` § "Quality bar" — deterministic test entry and no timeout-raising.

### Research decisions
- `.planning/research/ARCHITECTURE.md` § "Test / CI Topology" — project layout, jobs, Node versions,
  tarball smoke, and the 5-second timeout guidance.
- `.planning/research/PITFALLS.md` Pitfall 14 — never fix flakiness by raising timeouts; import-time
  root causes; CI determinism.
- `.planning/research/SUMMARY.md` § "Phase 4: Test entry and CI baseline" — deliverables and
  rationale.

### Current implementation
- `package.json` — scripts, `files`, `engines`, `packageManager`.
- `vitest.config.js` — current root include/exclude and node environment.
- `studio/vite.config.js` — Studio's embedded `test` block (`environment: node`,
  `include: ['test/**/*.test.js']`).
- `studio/package.json` — Studio `test` script and `engines.node >=20`.
- `.github/workflows/release-smoke.yml` — existing tarball smoke and Node 18 CLI floor.
- `scripts/smoke-pack.mjs` — build → `npm pack` → install → CLI/Studio health flow.
- `.planning/codebase/TESTING.md` — suite layout, naming, fixtures, cross-suite imports, and the
  release-smoke description.
- `test/cli-import.test.js`, `test/cli-import-capstone.test.js`, `test/cli-studio.test.js` — the
  reported timeout area; pinned dates and temp stores.
- `bin/node-version.js`, `test/node-version.test.js` — Node/sqlite floor semantics.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Vitest 5 `test.projects` (validated in this worktree: 57 files, 666 tests, one summary) — no new
  dependency or config file under `studio/` is required if the Studio project is declared inline.
- Existing `release-smoke.yml` jobs can carry the `develop` trigger, avoiding a duplicate smoke job.
- `scripts/smoke-pack.mjs` already parses `npm pack --json`; the returned `files` array is the
  cheapest place to assert package membership and token exclusion.
- `studio/test/adapter-contract.test.js` is imported by both suites; keep it as the shared contract.

### Established Patterns
- Root tests import `web/*` modules, so `web/node_modules` must exist even though root `npm ci` does
  not install it — this is why the old `pretest` installed web deps; CI must `npm ci` per package.
- Studio tests run under the `test` block in `studio/vite.config.js` with node environment; the root
  project config must not collect `studio/**` twice.
- Tests use temp dirs, explicit dates, and injected `fetchImpl`/clock values; preserve that style.
- Requirement IDs in `describe`/`it` titles are the convention (`QA-02`, etc.).

### Integration Points
- `.github/workflows/ci.yml` (new) ↔ `release-smoke.yml` (triggers) ↔ root scripts.
- `package.json` `files` ↔ `scripts/smoke-pack.mjs` assertions ↔ Phase 2 assets.
- `vitest.config.js` ↔ root `test/**` and `studio/test/**` ↔ `studio/vite.config.js` test block.
- CI test counts ↔ Vitest default reporter; no custom reporting infrastructure needed.

</code_context>

<specifics>
## Specific Ideas

- One command, one summary: `npm test` should print a single `Test Files`/`Tests` block covering both
  suites, and CI logs should make the combined count obvious without extra tooling.
- Security/drift jobs should be wired now and become meaningful the moment Phases 2 and 3 land; do
  not weaken them with `--passWithNoTests`.
- The Node 20 entry exists to prove the Studio engine floor, not to pretend root tests run there.
- "No real npm/network in the test path" is a hard rule; `pretest` is the current violation.

</specifics>

<deferred>
## Deferred Ideas

- E2E/Chromium jobs and `test:e2e` — Phase 12.
- `sync:shared` npm script — Phase 3 may request it from the Phase 4 script owner later.
- Coverage provider/tooling — not required by the milestone; would add a dependency (Phase 1-owned).
- Docs for the new commands (README/CHANGELOG) — Phase 11.

</deferred>

---

*Phase: 4-Test Entry and CI Baseline*
*Context gathered: 2026-10-22*
