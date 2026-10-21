# Phase 4: Test Entry and CI Baseline - Research

**Researched:** 2026-10-22
**Domain:** Vitest 5 project orchestration, GitHub Actions CI, npm packlist assertions, test determinism
**Confidence:** HIGH for the verified config/CI/npm mechanics and all in-repo facts; MEDIUM for the QA-05 root cause (not reproduced); one locked decision (Node 20 Studio job) is contradicted by verified runtime evidence.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Unified test entry
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

#### CI topology
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

#### Not-yet-merged suites and tarball assertions
- **D-10:** `scripts/smoke-pack.mjs` hard-asserts, from the `npm pack --json` file list, that
  `web/security.js` and `web/legacy-server.js` are present and that no packed basename is
  `.studio-token`. Packlist paths are repo-relative (`web/...`), not `package/web/...`; the JSON root
  must be normalized (array or object). It fails loudly if either security file is missing.
- **D-11:** To make D-10 true, Phase 4 adds `web/security.js` and `web/legacy-server.js` to root
  `package.json` `files`, next to `web/server.js`. This is the only exception to the "scripts only"
  ownership: it is a packaging consequence of this phase's own success criterion and was explicitly
  approved during discuss. Phase 2 still owns the file contents. Mark this exception in VERIFICATION.
  — **Reversibility:** reversible — two allowlist lines; removing them only changes the package.

#### QA-05 import-test timeout
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

### Deferred Ideas (OUT OF SCOPE)
- E2E/Chromium jobs and `test:e2e` — Phase 12.
- `sync:shared` npm script — Phase 3 may request it from the Phase 4 script owner later.
- Coverage provider/tooling — not required by the milestone; would add a dependency (Phase 1-owned).
- Docs for the new commands (README/CHANGELOG) — Phase 11.
</user_constraints>

## Summary

The phase is mechanically implementable with the locked stack: a temporary Vitest 5 `test.projects` config run from this worktree produced one summary of **57 files / 666 tests / ~2.2-2.7 s**, proving the root and Studio suites can share one process, one exit code, and one count `[VERIFIED: local npx vitest run --config <temp projects config>]`. `--project root` combined with a positional file filter works (`test/cli-import.test.js`: 1 file / 6 tests / exit 0), and a missing project root is a fatal error (exit 1), which is the behavior `test:security`/`test:drift` need before their suites exist `[VERIFIED: local Vitest 5.0.5 runs]`.

Two findings change how the planner must write the tasks. First, `npm pack --json` `files[].path` values are **repo-relative** (`web/security.js`), not `package/web/security.js`, and the JSON root is an array when a tarball is produced (existing `scripts/smoke-pack.mjs` already uses `.at(-1)`) but can be an object in dry-run output, so the assertion must normalize both shapes `[VERIFIED: local npm 11.19.0]`. Second, the locked D-06 premise that the Studio suite runs on Node 20 is false at HEAD: on Node 20.19.4, 42 of 43 Studio test files pass and `studio/test/agent-parsers.test.js` fails with `No such built-in module: node:sqlite` because it imports `web/studio-api.js` → `web/studio-db.js` → `node:sqlite`; Vitest 5 itself declares `engines.node: "^22.12.0 || ^24.0.0 || >=26.0.0"` and several Studio dependencies require >=22.12 `[VERIFIED: local Node 20.19.4 run + installed package engines]`.

QA-05 did not reproduce. Ten additional constrained runs (`--maxWorkers=1`) of `cli-import`, `cli-import-capstone`, and `cli-studio` had zero failures, the slowest single test was 33 ms, and the slowest file run was 803 ms; the orchestrator's 30-run evidence also had zero failures `[VERIFIED: local stress run]`. The only real npm/network step in the `npm test` path is `pretest` (`npm --prefix web install`), which runs before Vitest starts and therefore cannot consume Vitest's per-test 5000 ms timeout — but it can look like a hang and must still be removed. The phase should record this evidence, not raise `testTimeout`.

**Primary recommendation:** Implement the verified projects config and scripts, build `ci.yml` around Node 22 for the full suite, surface the Node 20 decision conflict to the orchestrator/user before writing a knowingly-red matrix entry, assert `web/security.js` / `web/legacy-server.js` / `.studio-token` from a normalized `npm pack --json` list using `web/...` paths, and treat QA-05 as "remove the network path + record 30-run evidence" unless a stress run reproduces.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Unified test entry and combined count | Local test runner (Vitest projects) | Developer shell | One process owns collection, scheduling, summary, and exit code. |
| Offline dependency readiness | Local tooling / config-time guard | CI install step | The test path must never mutate or fetch; CI prepares package roots explicitly. |
| CI trigger, matrix, timeouts, concurrency | GitHub Actions workflow | Repository branch policy | Workflow YAML owns scheduling and isolation; branch protection consumes job results. |
| Security/drift suite gating | Root Vitest project | GitHub Actions jobs | Scripts select the suite; CI decides pass/fail. |
| Tarball membership and token exclusion | npm packlist (`npm pack --json`) | Release smoke workflow | The packlist is the authoritative set of files that would ship. |
| Import-test determinism | Test harness / fixtures | CI worker scheduling | Explicit clock, temp dirs, and injected adapters remove environment dependence. |

## Project Constraints (from AGENTS.md)

| Directive | Consequence for this phase |
|-----------|----------------------------|
| Core plugin has no build step; Markdown is read directly | Do not introduce a build requirement for plugin/core assets. CI jobs may build only the web/Studio bundles needed by the tarball smoke. |
| ES modules for `.js` with `"type": "module"`; CommonJS only for hooks loaded by older runtimes | New scripts (`scripts/check-test-deps.mjs`, edits to `smoke-pack.mjs`) must use ESM imports. |
| File names kebab-case; functions camelCase; constants UPPER_SNAKE_CASE | New script and helper names follow kebab-case; no new camel-case filenames. |
| 2 spaces, max 100 characters, semicolons, spaces around operators | Applies to `vitest.config.js`, workflow-adjacent scripts, and any new guard script. |
| JSDoc for exported functions | The offline dependency guard must document its exported entry point if it exports one. |
| Wrap filesystem operations in try/catch; informative errors | The guard and smoke assertions must fail loudly with an actionable `npm ci` / `npm --prefix studio ci` message. |
| Always use `path.join()` for cross-platform paths | Smoke-pack assertions and guard resolution must use `path.join`, not string concatenation. |
| Tests live in `test/*.test.js`; Vitest; mock external dependencies; use temp dirs; test success and error paths | Any hardening of `test/cli-import*.test.js` stays in the existing Vitest style and uses temp dirs and explicit dates. |
| Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`) | Phase commits must follow this format. |

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Vitest (root) | `^5.0.5`, resolved `5.0.5` | Root + Studio project orchestration | Native `test.projects`, one summary, one exit code; already installed `[VERIFIED: node_modules/vitest/package.json]` |
| Vitest (Studio) | `^5.0.4`, resolved `5.0.4` | Studio suite kernel | Same major; supports projects and node environment `[VERIFIED: studio/node_modules/vitest/package.json]` |
| Node.js (CI full suite) | 22.x latest (>=22.12) | Root tests (`node:sqlite` >=22.5) and Studio (Vitest 5 >=22.12) | Satisfies both floors with one runner `[VERIFIED: bin/node-version.js:10 and vitest engines]` |
| npm | 11.19.0 locally; 10.x on Node 18 runner | Install, pack, script execution | Root `packageManager` pin is `npm@11.19.0`; Node 18's bundled npm 10 still installs the lockfile `[VERIFIED: package.json:74 + local npm 10 dry-run]` |
| `actions/checkout@v4` | v4 | Checkout | Locked by D-08/D-05 convention; no behavior risk `[CITED: docs.github.com workflow syntax]` |
| `actions/setup-node@v4` | v4 | Node + npm cache | Supports `cache: npm` and multi-file `cache-dependency-path` `[CITED: github.com/actions/setup-node]` |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| Ruby stdlib `yaml` | System Ruby 3.x | Local workflow YAML syntax validation without a repo dependency | Before pushing workflow edits `[VERIFIED: local ruby -ryaml parse]` |
| Python 3 + PyYAML | System Python | Optional second YAML syntax check | Local only; not a project dependency `[VERIFIED: local python3 import yaml]` |
| `npm pack --json` | npm 11.19.0 | Authoritative tarball file list | Smoke assertion and local packaging check `[VERIFIED: local npm pack]` |
| `node:sqlite` | Node >=22.5 | Root tests import the Studio SQLite layer | CI full-suite job and local root suite `[VERIFIED: web/studio-db.js:17 + bin/node-version.js:10]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest `test.projects` | `vitest run && npm --prefix studio test` | Documented fallback, but produces two summaries/exit codes and violates "one combined count" unless wrapped and parsed. Keep as fallback only. |
| Inline Studio project | `studio/vitest.config.js` | Extra file and config drift; inline object already verified. Create only if the planner needs project-specific options. |
| `npm pack --json` assertion | `tar -tzf` parsing | Tarball paths use `package/...`; packlist JSON is cheaper and already used by `smoke-pack.mjs`. Do not parse tar text. |
| Ruby/PyYAML syntax check | `actionlint` / `yaml` npm package | Adds a dependency or network download; D-14 forbids repo dependencies. GitHub validates workflow semantics on push. |

**Installation:** none. This phase adds no dependencies and does not edit lockfiles (D-14).

**Version verification:** `npm view vitest version` → `5.0.5`; `npm view vite version` → `8.3.5` `[VERIFIED: npm registry, 2026-10-22]`. Installed Studio versions are pinned by `studio/package-lock.json` (Vitest 5.0.4, Vite 8.3.4), so do not run an upgrade.

## Package Legitimacy Audit

**No packages are installed or added by this phase (D-14).** The phase uses only already-installed tooling (`vitest`, `npm`, GitHub Actions) and Node/Ruby/Python standard libraries. No legitimacy gate is applicable.

**Packages removed due to SLOP verdict:** none.
**Packages flagged as suspicious (SUS):** none.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QA-02 | One `npm test` runs both root and Studio suites without watch mode and reports a combined test count | Verified projects config (57 files / 666 tests, one summary) and `test`/`test:watch` script split; see Findings 1 and Recommended Approach. |
| QA-03 | CI runs on every push to `develop` and every PR into `develop`: unit (root + Studio), security, drift, tarball smoke and the Node 18 CLI floor | Verified trigger/matrix/cache/timeout syntax, known Node 18 and Node 20 behavior, and the release-smoke split; see Findings 2 and Recommended Approach. |
| QA-05 | Slow or flaky import tests are deterministic; the reported 5-second timeout is root-caused, not fixed by raising timeouts | Verified non-reproduction, per-test timeout semantics, and removal of the only real npm/network path; see Finding 4 and the Validation Architecture stress gate. |

## Findings

### Finding 1: Vitest 5 `test.projects` works with two inline projects and one combined summary

**Confidence:** HIGH

Verified configuration (run from the repo root; produced 57 files / 666 tests):

```js
// vitest.config.js
import { defineConfig } from 'vitest/config';

const sharedExclude = [
  '**/node_modules/**',
  '**/.claude/**',
  '**/.agents/**',
  '**/bin/**',
  '**/web/**',
  '**/skills/**/*.test.ts',
];

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'root',
          include: ['test/**/*.test.js'],
          exclude: sharedExclude,
          environment: 'node',
        },
      },
      {
        extends: true,
        root: './studio',
        test: {
          name: 'studio',
          include: ['test/**/*.test.js'],
          environment: 'node',
        },
      },
    ],
  },
});
```

`[VERIFIED: local Vitest 5.0.5 run with this exact config — Test Files 57 passed (57), Tests 666 passed (666), one Duration and one exit code]`

Key semantics, each checked against the official Vitest 5 docs or the installed runtime:

- `test.projects` accepts inline configs, config-file paths, and glob patterns; inline configs are supported alongside file references `[CITED: vitest.dev/guide/projects]`.
- Inline projects inherit the root config by default in Vitest 5 via `extends` (default `true`); `extends: false` opts out `[CITED: vitest.dev/guide/projects]`.
- The root `vitest.config.js` is **not** treated as a project unless explicitly listed; the root-level options only influence global concerns such as reporters and coverage. The `root` project must therefore be declared explicitly or root tests would disappear `[CITED: vitest.dev/guide/projects]`.
- Project names must be unique; inline configs should set `name` because Vitest otherwise assigns a number `[CITED: vitest.dev/guide/projects]`.
- A project `root` is a top-level Vite option (`root: './studio'`), not `test.root`; both forms happened to work in local experiments, but the top-level form is the canonical shape and the one to write `[VERIFIED: local Vitest 5.0.5 runs with top-level project root — 57 files / 666 tests]`.
- A missing project root is fatal: `Root path does not exist or is not a directory: .../no-such-dir`, exit 1 `[VERIFIED: local Vitest 5.0.5 run]`. This means a typo in `root: './studio'` cannot silently pass.
- `--project <name>` filters projects; it can be repeated and supports wildcards/exclusions `[CITED: vitest.dev/guide/projects]`.
- Positional filters still apply after `--project`: `npx vitest run --config <projects config> --project root test/cli-import.test.js` → 1 file / 6 tests / exit 0 `[VERIFIED: local run]`.
- A positional filter that matches nothing under the selected project exits 1 with `No test files found, exiting with code 1` and prints the project's include/exclude. This is exactly the behavior `test:security` and `test:drift` need pre-merge; do not add `--passWithNoTests` `[VERIFIED: local run of --project root test/security]`.
- Watch mode: `vitest` runs all projects in one process; `--project` narrows the watch set. `test:watch` should be the bare `vitest`, while `test` is `vitest run` `[CITED: vitest.dev/guide/projects]`.
- `process.cwd()` inside every project remains the directory where Vitest was started, even when a project has a different `root`. Studio tests here do not depend on cwd (no `process.cwd()` usage in `studio/test`), so the inline project is safe `[CITED: vitest.dev/guide/common-errors#project-working-directory-does-not-change] [VERIFIED: grep of studio/test and test for process.cwd()]`.

**No `studio/vitest.config.js` is needed.** The inline project object plus `root: './studio'` collects `studio/test/**/*.test.js`; the existing `test` block in `studio/vite.config.js` remains the standalone `npm --prefix studio test` config and is not consulted by the root projects run `[VERIFIED: local run + studio/vite.config.js:11]`.

**Counts are not a contract.** At research time the suites are 14 root files + 43 Studio files = 57; 294 root tests + 372 Studio tests = 666. The validation must compare the combined summary to the sum of the two suite runs dynamically, not hard-code 666.

### Finding 2: GitHub Actions topology, and a verified conflict with the Node 20 Studio assumption

**Confidence:** HIGH (syntax and runtime evidence); the Node 20 decision needs user/orchestrator resolution

Syntax that is safe to use:

- Matrix with per-entry command:

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - node: 22
        command: npm test
      - node: 20
        command: npm --prefix studio test
```

  `jobs.<job_id>.strategy.matrix.include` is the documented way to add configuration objects to a matrix `[CITED: docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs]`.
- `run: ${{ matrix.command }}` is a normal expression in a step; static matrix values do not create an injection surface. Do not interpolate `github.event.*` into `run` `[CITED: docs.github.com workflow syntax]`.
- `actions/setup-node@v4` supports `cache: npm` and `cache-dependency-path`; the path input accepts multiple files (newline-separated) `[CITED: github.com/actions/setup-node]`:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: ${{ matrix.node }}
    cache: npm
    cache-dependency-path: |
      package-lock.json
      studio/package-lock.json
      web/package-lock.json
      web/client/package-lock.json
```

- Workflow-level `permissions: contents: read` is valid and is the setup-node-recommended minimum `[CITED: docs.github.com workflow syntax + setup-node README]`.
- Workflow-level `concurrency` with `cancel-in-progress: true` is valid; the expression may use `github`, `inputs`, and `vars` `[CITED: docs.github.com workflow syntax#concurrency]`.
- `jobs.<job_id>.timeout-minutes` accepts a positive integer and applies to the whole job `[CITED: docs.github.com workflow syntax#jobsjob_idtimeout-minutes]`.
- `pull_request.branches: [develop, main]` restricts PR triggers to those targets; `push.branches` behaves the same `[CITED: docs.github.com workflow syntax]`.

**Node 20 cannot run the current Studio suite.** On Node 20.19.4, running the Studio suite produced:

```
Test Files  1 failed | 42 passed (43)
Tests       347 passed (347)
FAIL  test/agent-parsers.test.js
Error: No such built-in module: node:sqlite
```

The failure chain is:

- `studio/test/agent-parsers.test.js` imports `../../web/studio-api.js` `[VERIFIED: studio/test/agent-parsers.test.js:32]`.
- `web/studio-api.js` imports `./studio-db.js` `[VERIFIED: web/studio-api.js:23]`.
- `web/studio-db.js` statically imports `{ DatabaseSync } from 'node:sqlite'` `[VERIFIED: web/studio-db.js:17]`.
- `node:sqlite` ships from Node 22.5 `[VERIFIED: bin/node-version.js:10 — "export const STUDIO_MIN_NODE = { major: 22, minor: 5 };" and the file comment "ships from Node 22.5.0"]`.

This is not only a test-file accident. The installed Studio toolchain also declares a higher floor:

- Studio Vitest resolves to `5.0.4` with `engines.node: "^22.12.0 || ^24.0.0 || >=26.0.0"` `[VERIFIED: studio/node_modules/vitest/package.json]`.
- Studio Vite resolves to `8.3.4` with `engines.node: "^20.19.0 || >=22.12.0"` `[VERIFIED: studio/node_modules/vite/package.json]`.
- `npm ci --dry-run` under Node 20.19.4 + npm 10.9.4 exits 0 but prints `EBADENGINE` warnings for Studio dependencies such as `@mermaid-js/parser@2.0.1` (`>=22.12.0`) and `chevrotain@13.2.0` (`>=22.0.0`) `[VERIFIED: local dry-run]`. So install succeeds, execution fails.

`studio/package.json` still says `"node": ">=20"` `[VERIFIED: studio/package.json:13-15]`, but that declaration is contradicted by the installed dependency tree. The D-06 statement that "Studio's suite is IndexedDB/fake-indexeddb and declares engines.node >=20" is true only for most of the suite; it omits the one cross-suite import and the Vitest 5 engine.

**Node 18 CLI floor is viable.** Root `npm ci` with Node 18.20.8 + npm 10.9.4 succeeds (`--dry-run`, exit 0, 218 packages planned) and `node bin/cli.js --help` / `node bin/cli.js doctor` both exit 0 under Node 18 `[VERIFIED: local Node 18.20.8 + npm 10.9.4 dry-run and CLI runs]`. Do not try to execute npm 11 on Node 18: npm 11 requires a newer Node, and `actions/setup-node` with `node-version: '18'` supplies npm 10.x. The `packageManager: "npm@11.19.0"` pin in `package.json:74` is advisory to setup-node caching, not an instruction that npm 11 must run in the Node 18 job `[VERIFIED: package.json:74]`.

**Resolution options for D-06 (planner must pick one with the user/orchestrator):**

1. **Recommended:** Node 22 runs the full `npm test`; replace the Node 20 matrix entry with Node 24 (both satisfy Vitest 5 and root `node:sqlite`). This keeps the unit job honestly green and still tests two runtimes.
2. Keep a Node 20 "Studio engine floor" job but run only the 42 Node-20-safe Studio test files (for example via a phase-owned `studio/vitest.config.*` that excludes `test/agent-parsers.test.js`), and document that one bridge-parser file is not covered. This preserves D-06's runtime check at the cost of coverage and still uses a Vitest version that does not support Node 20.
3. Make `studio/test/agent-parsers.test.js` stop importing `web/studio-api.js` (move parsers to a pure module). This is out of Phase 4 ownership and would touch Phase 2/Studio files.
4. Ship Node 20 red with a comment. Do not do this: a permanently red required job trains reviewers to ignore CI.

### Finding 3: `npm pack --json` schema and the correct assertion shape

**Confidence:** HIGH

Running `npm pack --json` in this repo (npm 11.19.0) returned an **array**:

```json
[
  {
    "id": "course-professor@1.6.0-beta.1",
    "name": "course-professor",
    "version": "1.6.0-beta.1",
    "filename": "course-professor-1.6.0-beta.1.tgz",
    "files": [
      { "path": "CHANGELOG.md", "size": 3412, "mode": 420 },
      { "path": "bin/cli.js", "size": 32950, "mode": 493 }
    ]
  }
]
```

`[VERIFIED: local `npm pack --json` output, npm 11.19.0]`

Critical details:

- The packed file list is `result[].files[].path` and each path is **repo-relative with no `package/` prefix**: `web/server.js`, not `package/web/server.js`. The `package/...` prefix appears only inside the tarball (`tar -tzf`), not in the packlist JSON `[VERIFIED: local `npm pack --json` and `npm pack --dry-run --json`]`.
- The top-level shape is not stable across invocations in local experiments: a real pack returned an array; an early `--dry-run --json` invocation piped through Node returned an object. Normalize before reading:

```js
const raw = JSON.parse(pack.stdout);
const entries = Array.isArray(raw) ? raw : [raw];
const files = entries.flatMap((entry) => entry.files ?? []);
const paths = new Set(files.map((file) => file.path));
```

- The existing `scripts/smoke-pack.mjs` uses `JSON.parse(pack.stdout).at(-1).filename` `[VERIFIED: scripts/smoke-pack.mjs:141-149]`; this is correct for the array shape and should be preserved (or normalized) while adding the membership assertions.
- The token's real path is `web/.studio-token`:

  - `export const TOKEN_FILE = join(__dirname, '.studio-token');` where `__dirname` is `web/` `[VERIFIED: web/studio-api.js:31-35]`.
  - `const tokenFile = join(repoRoot, 'web', '.studio-token');` `[VERIFIED: bin/commands/studio.js:149-152]`.
  - `.npmignore` already excludes it with the comment "The pairing token must never leave a machine" `[VERIFIED: .npmignore:19-20]`.

- The assertion must test the packed list, not `fs.existsSync('web/.studio-token')`: the token may exist on the developer machine while being correctly excluded from the tarball.
- Assert exact repository-relative paths `web/security.js` and `web/legacy-server.js`; assert no packed path's basename equals `.studio-token` (optionally also reject a basename ending in `.token`). Do not reject every path containing the substring `token`, which would false-positive on future assets such as `tokenizer.js`.
- The current packlist contains neither security file and no token-like path:
  - `web/security.js` present: false
  - `web/legacy-server.js` present: false
  - token-like paths: none

  `[VERIFIED: local `npm pack --dry-run --json` + Node filter]`. This is expected: Phase 2 owns those files and Phase 4 adds the two `files` entries (D-11).

- `package.json` `files` currently lists `web/server.js`, `web/studio-api.js`, `web/studio-db.js`, etc., but not the two Phase 2 files `[VERIFIED: package.json:19-47]`. Add `web/security.js` and `web/legacy-server.js` next to `web/server.js`.

### Finding 4: QA-05 — the 5-second timeout is not reproducible, and the network path is the only real defect

**Confidence:** MEDIUM for root cause, HIGH for the measurements

Evidence gathered in this worktree:

- Orchestrator evidence: 30 repeated runs of `test/cli-import.test.js` + `test/cli-import-capstone.test.js` had 0 failures; 15 runs including `test/cli-studio.test.js` also had 0.
- This research added 10 constrained runs of all three files with `--maxWorkers=1`: 0 failures, durations 0.65-0.80 s, slowest single test 33 ms, slowest `waitForHealth` timeout test 6 ms `[VERIFIED: local runs]`.
- Full suite with projects: 57 files / 666 tests in 2.2-2.7 s; no test approached 5 s `[VERIFIED: local run]`.
- The import tests already use temp dirs and explicit dates:

  ```js
  const course = readCourse(FIXTURE, { slug: 'flavour-table', today: '2026-10-15' });
  const plan = planCourseImport(course, { now: Date.parse('2026-10-15T12:00:00Z') });
  ```

  `[VERIFIED: test/cli-import.test.js:43-47]`

- `pretest` is `npm --prefix web install --no-audit --no-fund --silent` `[VERIFIED: package.json:15]`. It performs a real registry install in the test path. It runs **before** Vitest starts, so it cannot consume Vitest's per-test `testTimeout`; it can make `npm test` look hung and it is the one violation of D-03/D-13.
- `testTimeout` is the per-test timeout, default 5000 ms; raising it would hide a slow test without fixing the cause `[CITED: vitest.dev/config/#testtimeout]`. D-04 keeps the default.
- The installed dependency tree has no other test-path network call: root tests import `web/*` (express/cors resolve from root dependencies), Studio tests use `fake-indexeddb`, and network boundaries are mocked with `vi.stubGlobal('fetch', ...)` / `vi.mock('https', ...)` `[VERIFIED: .planning/codebase/TESTING.md:63-125 and local grep]`.

Ranked root-cause hypotheses (not confirmed):

1. **`pretest` install latency was mistaken for a test timeout.** This is the most likely explanation for a "5-second import-test timeout" report: the clock starts at `npm test`, the install takes the time, and the subsequent failure/verbose output points at the first import test. Removing `pretest` removes the only real npm/network step.
2. **A dynamic import inside a test body under CPU contention.** `test/cli.test.js` has `const { default: inquirer } = await import('inquirer');` inside tests `[VERIFIED: test/cli.test.js:236-249]`, and `https` dynamic imports inside tests. `inquirer` cold import measured 137 ms locally; under 57 isolated workers on a 2-core CI runner this could be slower, but 5 s is implausible unless the machine is heavily oversubscribed. This file is not owned by Phase 4.
3. **Native SQLite initialization per test.** `createStudioStore` opens a fresh `node:sqlite` DB per test; measured import 3-5 ms and each test 3-18 ms. No evidence of a 5 s cost. Do not change the test design just to share a store unless a repro shows it.
4. **Worker/import cost counted as test time.** Vitest's per-test timeout starts when the test function runs, not during file collection. A slow module graph inflates wall-clock duration but not the per-test timeout, so it would not produce a 5 s test failure `[CITED: vitest.dev/config/#testtimeout]`.
5. **Wall clock / Home directory dependence.** The owned import tests already use `mkdtempSync` and fixed dates. One `readCourse(FIXTURE, { slug: 'flavour-table' })` call in `applyCourseImport` tests omits `today`, but those assertions only count rows, so no observed flake. Passing `today: '2026-10-15'` everywhere in the owned file is a safe hardening.

Deterministic fix pattern if a repro appears:

- Remove `pretest` install and replace it with an offline resolve/import guard (D-03).
- In owned `test/cli-import*.test.js`, pass explicit `today`/`now` into every `readCourse`/`planCourseImport`/`run` call; keep temp dirs; never touch `~/.professor`.
- If a dynamic import inside a test is the culprit, hoist it to module scope where mocks permit, or inject the dependency; do not raise `testTimeout`.
- If SQLite init is the culprit, reuse a per-file store with unique rows or use `createMemoryAdapter()` only for adapter-agnostic tests; keep at least one real SQLite integration path.
- Add a 30-run stress gate (below) so the claim is evidenced, not asserted.

### Finding 5: Nyquist validation can be local-first with zero new dependencies

**Confidence:** HIGH

- Workflow YAML syntax can be parsed with Ruby's standard library (`ruby -ryaml -e 'YAML.load_file(...)'`) or system PyYAML; both are already present locally `[VERIFIED: local ruby and python3 checks]`. These are validation tools, not project dependencies, so D-14 is preserved.
- Semantics (trigger firing, cache hits, matrix expansion, job success) can only be confirmed on GitHub. Local checks are necessary but not sufficient.
- Ruby/PyYAML treat the YAML 1.1 key `on` as boolean `true`; a YAML-based assertion must account for that (or rely on textual checks for the `on:` block). GitHub's parser accepts the same file as intended.
- `npm pack --json` has no officially documented field schema beyond "write the filenames out to stdout" `[CITED: docs.npmjs.com/cli/v11/commands/npm-pack]`; the field shape is verified against npm 11.19.0 locally. Pin the assertion to the installed npm major and keep the smoke script's normalizer tolerant.
- `actionlint` and `yaml` npm packages are not allowed (new dependency/network). Do not add them.

## Recommended Approach

### 1. Replace `vitest.config.js` with the verified projects config

Use the exact config in Finding 1. Keep project names `root` and `studio`. Keep `extends: true`; explicitly set `include` and `environment` per project. Do not create `studio/vitest.config.js` unless a Node 20-safe project variant is chosen (see Finding 2, option 2).

Validation after the edit:

```bash
npm test
# expect: one Test Files / Tests summary, 57 files / 666 tests at current counts, exit 0
npx vitest run test/cli-import.test.js
# expect: one file passes under the root project
```

### 2. Change root scripts exactly as locked

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:security": "vitest run test/security --project root",
    "test:drift": "vitest run test/shared-drift.test.js --project root"
  }
}
```

Remove `pretest`. Add the offline guard either as `"pretest": "node scripts/check-test-deps.mjs"` (recommended for readability; confirm ownership because the roadmap says "scripts only" and lists only `scripts/smoke-pack.mjs`) or inline in `vitest.config.js` at config load (no new file, uglier error). The guard must:

- Resolve `express` and `cors` from the root (root `dependencies` already contain both) `[VERIFIED: package.json:62-68]`.
- Resolve `fake-indexeddb/auto` from the Studio package root, because `test/cli-studio.test.js` imports `studio/test/adapter-contract.test.js`, which imports it; root `npm ci` does not provide it `[VERIFIED: studio/test/adapter-contract.test.js:1 + test/cli-studio.test.js:25]`.
- Check `node:sqlite` availability and tell the user to update to Node >=22.5 if missing.
- Print `npm ci` and `npm --prefix studio ci` instructions, then exit non-zero.
- Never import `studio/test/adapter-contract.test.js` directly outside Vitest: importing `vitest` in a plain Node process failed locally with `Cannot read properties of undefined (reading 'config')` `[VERIFIED: local node import probe]`. Resolve package names instead.

Do not install, build, or fetch in the guard.

### 3. Add `.github/workflows/ci.yml` with Node 22 full-suite first

Recommended shape (semantics verified, Node 20 entry pending decision):

```yaml
name: CI

on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [develop, main]

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  unit:
    name: Unit (Node ${{ matrix.node }})
    runs-on: ubuntu-latest
    timeout-minutes: 20
    strategy:
      fail-fast: false
      matrix:
        include:
          - node: 22
            command: npm test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
          cache-dependency-path: |
            package-lock.json
            studio/package-lock.json
            web/package-lock.json
            web/client/package-lock.json
      - run: npm ci
      - run: npm --prefix studio ci
      - run: ${{ matrix.command }}

  security:
    name: Security suite
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: |
            package-lock.json
            studio/package-lock.json
            web/package-lock.json
            web/client/package-lock.json
      - run: npm ci
      - run: npm --prefix studio ci
      - run: npm run test:security

  drift:
    name: Shared drift
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run test:drift
```

Notes:

- If D-06 is preserved, add the Node 20 entry to the `include` list, but do not merge it until the Node 20 failure is resolved (Finding 2). A knowingly-red required job is worse than a documented floor decision.
- `security` and `drift` are expected red until Phases 2/3 land (D-09). Do not add `--passWithNoTests` or `continue-on-error`.
- `npm --prefix studio ci` is required before `npm test` because the root suite imports `studio/test/adapter-contract.test.js` (fake-indexeddb) and because the Studio project runs from `studio/`.
- `timeout-minutes` values above are recommendations, not measured CI limits; tune after the first green run.

### 4. Extend `release-smoke.yml` instead of duplicating the smoke job

- Change `push.branches` to `[main, develop]`; keep `pull_request` and `workflow_dispatch` (D-07). Removing stale `feat/studio-local-first` is preferred and within discretion `[VERIFIED: .github/workflows/release-smoke.yml:6-12]`.
- Add `timeout-minutes` to both jobs (for example 30 for tarball smoke, 10 for CLI floor) `[VERIFIED: .github/workflows/release-smoke.yml:14-41 currently has none]`.
- Keep `tarball-smoke` on Node 22 and `cli-floor` on Node 18.
- For the tarball job, install all four package roots with `npm ci`, build directly, then run the smoke script without its internal installs/builds:

```yaml
- run: npm ci
- run: npm --prefix web ci
- run: npm --prefix web/client ci
- run: npm --prefix studio ci
- run: npm --prefix web/client run build
- run: npm --prefix studio run build
- run: SMOKE_SKIP_BUILD=1 npm run smoke:pack
```

  The root `build` and `build:studio` scripts currently install (`cd web/client && npm install ...` and `npm --prefix studio install ...`) `[VERIFIED: package.json:11-12]`, so CI must call the package build scripts directly to avoid network installs. `SMOKE_SKIP_BUILD=1` skips only the script's own build step `[VERIFIED: scripts/smoke-pack.mjs:130-135]`.

- Caveat: `SMOKE_SKIP_BUILD=1` does **not** make the smoke script fully offline. It still runs `npm init -y` and `npm install <tgz>` in a temp project, which resolves the package's runtime dependencies from the registry `[VERIFIED: scripts/smoke-pack.mjs:152-155]`. That is inherent to testing what a stranger installs. If D-08's "no installs in CI" is interpreted literally, it is impossible with this smoke design; interpret it as "no workspace installs inside the script".

- The tarball job will fail until Phase 2's files exist and D-11's `files` entries are added. Phase 4 is merged after Phase 2 (D-09), but this phase's worktree currently lacks those files. The plan must either rebase/merge Phase 2 into the branch before running smoke, or mark the local smoke assertion as deferred with the exact dependency recorded.

### 5. Add packlist assertions to `scripts/smoke-pack.mjs`

Insert after the existing `npm pack` parse and before installing the tarball. Normalize the JSON root, use `web/...` paths, and fail with actionable text:

```js
const raw = JSON.parse(pack.stdout);
const entries = Array.isArray(raw) ? raw : [raw];
const packedFiles = entries.flatMap((entry) => entry.files ?? []);
const packedPaths = new Set(packedFiles.map((file) => file.path));

for (const required of ['web/security.js', 'web/legacy-server.js']) {
  if (!packedPaths.has(required)) {
    fail(`packed tarball is missing ${required}. Add it to package.json "files" and rebuild the package.`);
  }
}

const leakedTokens = packedFiles.filter((file) => file.path.split('/').pop() === '.studio-token');
if (leakedTokens.length > 0) {
  fail(`pairing token would be published: ${leakedTokens.map((file) => file.path).join(', ')}`);
}
```

`[VERIFIED: path format and JSON shapes from local npm 11.19.0 runs; token path from web/studio-api.js:35 and bin/commands/studio.js:152]`

Add the two `files` entries next to `web/server.js` (D-11 exception). Keep the existing `filename` parse or replace it with the same normalized `entries.at(-1).filename` for consistency.

### 6. QA-05 execution order

1. Remove `pretest` and add the offline guard.
2. Run the owned suites 30+ times, including at least 10 with `--maxWorkers=1`:

   ```bash
   for i in $(seq 1 30); do
     npx vitest run test/cli-import.test.js test/cli-import-capstone.test.js test/cli-studio.test.js || exit 1
   done
   ```

3. Record commands, counts, durations, and the maximum single-test duration in VERIFICATION. If zero failures, state that the timeout did not reproduce after removing the network path, and that `testTimeout` remains at the default.
4. Only if it reproduces, harden the owned test at the source and rerun 30+ times.
5. Run `npm test` twice in a row and confirm one summary each time, exit 0.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Combining two suites into one count | A shell wrapper that parses two Vitest outputs | Vitest `test.projects` | One process, one summary, one exit code; verified 57/666. |
| Per-node-version command selection | A bash `if` on `node -v` inside one job | Matrix `include` with `command` | Documented matrix expansion; each combination is visible and isolated. |
| npm cache across four package roots | A manual `actions/cache` step with custom key | `actions/setup-node@v4` `cache: npm` + `cache-dependency-path` | Hash handling, restore/save, and OS paths are handled by the action. |
| YAML validation | A hand-written YAML parser | Ruby stdlib `yaml` or system PyYAML for syntax; GitHub for semantics | No dependency, no network, no parser maintenance. |
| Tarball membership | `tar -tzf` string parsing | `npm pack --json` `files[].path` | Packlist is authoritative and already parsed by the smoke script. |
| Token exclusion | `fs.existsSync('web/.studio-token')` | Assert the packed path set | The token may exist locally and correctly be excluded; only the tarball matters. |
| Test determinism | Raising `testTimeout` | Explicit `today`/`now`, temp dirs, injected `fetchImpl`, remove `pretest` install | Raising the timeout hides the cause and violates D-04. |

**Key insight:** every mechanism this phase needs already exists in Vitest, npm, and GitHub Actions. The work is configuration, assertions, and removal of the one network side effect — not new infrastructure.

## Common Pitfalls

### Pitfall 1: Using `package/web/security.js` in the packlist assertion

**What goes wrong:** The assertion always fails even though the file ships.
**Why it happens:** `package/...` is the path inside the `.tgz`, not the `npm pack --json` `files[].path`.
**How to avoid:** Assert `web/security.js` and `web/legacy-server.js` in the JSON list; use `package/...` only if parsing `tar -tzf`.
**Warning signs:** A manually inspected tarball shows the file but the smoke script says it is missing.

### Pitfall 2: Assuming `npm pack --json` is always an array

**What goes wrong:** `JSON.parse(stdout).files` is `undefined`, or `.at(-1)` throws.
**Why it happens:** Local npm 11 returned an array for a real pack and an object from one dry-run invocation.
**How to avoid:** Normalize with `Array.isArray(raw) ? raw : [raw]` and flatten `files`.
**Warning signs:** `undefined` file list or `... .at is not a function`.

### Pitfall 3: Merging a Node 20 Studio job that is already red

**What goes wrong:** CI is red on every push before security/drift even run; reviewers stop trusting it.
**Why it happens:** D-06 assumed the Studio suite is Node 20-safe; `agent-parsers.test.js` imports `node:sqlite`, and Vitest 5 requires Node 22.12.
**How to avoid:** Resolve the decision before writing the matrix entry; use Node 22 (and optionally 24) for the full suite, or a documented Node 20 subset.
**Warning signs:** `No such built-in module: node:sqlite` in the Node 20 job with 42/43 files passing.

### Pitfall 4: Adding `--passWithNoTests` to make security/drift green

**What goes wrong:** The jobs pass while the suites do not exist, defeating QA-03's future value.
**Why it happens:** Vitest exits 1 when a filter matches no files.
**How to avoid:** Keep the hard failure; Phase 4 merges after Phases 2/3 (D-09), and VERIFICATION records the dependency.
**Warning signs:** A green security job with zero tests reported.

### Pitfall 5: Leaving `pretest` in place

**What goes wrong:** `npm test` performs a real registry install; a slow/offline network looks like a test hang and violates D-03/D-13.
**Why it happens:** The old script exists to populate `web/node_modules`, but root `dependencies` already provide `express`/`cors` for the root suite.
**How to avoid:** Remove `pretest`; install per package root in CI; use the offline guard for local diagnostics.
**Warning signs:** Network traffic or multi-second delay before Vitest's banner; `npm --prefix web install` in the script.

### Pitfall 6: Forgetting the root project in `test.projects`

**What goes wrong:** Only Studio tests run, or the combined count silently drops the root suite.
**Why it happens:** Vitest does not treat the root config as a project unless it is explicitly declared.
**How to avoid:** Declare both `root` and `studio` inline projects; run the full suite and compare the file count to 14 + 43.
**Warning signs:** Combined count equals the Studio count only.

### Pitfall 7: Inheriting the root `exclude` unintentionally

**What goes wrong:** A future Studio test under a directory matching `**/web/**` or `**/bin/**` disappears from the Studio project.
**Why it happens:** Inline projects inherit root test options by default (`extends: true`), including exclude patterns.
**How to avoid:** Keep the shared exclude intentional; if Studio needs different excludes, set `extends: false` and redeclare `environment`/`include`/`exclude`.
**Warning signs:** A test file passes when run directly but is absent from `npm test`.

### Pitfall 8: Assuming `SMOKE_SKIP_BUILD=1` makes the smoke fully offline

**What goes wrong:** CI still needs registry access to install the tarball's runtime dependencies.
**Why it happens:** The flag only skips the script's build step; the temp-project `npm install <tgz>` remains.
**How to avoid:** Accept the registry install as part of the "stranger install" assertion, or redesign the smoke in a later phase. Do not claim the job is offline.
**Warning signs:** `npm install` output in the tarball job after `SMOKE_SKIP_BUILD=1`.

### Pitfall 9: Running the root suite without Studio dependencies

**What goes wrong:** `npm test` fails resolving `fake-indexeddb/auto` even though root dependencies are installed.
**Why it happens:** `test/cli-studio.test.js` imports `studio/test/adapter-contract.test.js`, which imports `fake-indexeddb/auto` from `studio/node_modules`.
**How to avoid:** `npm --prefix studio ci` before `npm test` locally and in CI; the guard must check this explicitly.
**Warning signs:** `Cannot find package 'fake-indexeddb'` on the first Studio-contract test.

### Pitfall 10: Raising `testTimeout` to "fix" QA-05

**What goes wrong:** A real slow/network path stays hidden and returns on a slower runner.
**Why it happens:** The default is 5000 ms and the reported failure is exactly 5000 ms.
**How to avoid:** Remove the network path, measure per-test durations, stress-run; only change the test's inputs/clock/fs.
**Warning signs:** A diff that edits `testTimeout` or `hookTimeout` with no repro evidence.

## Code Examples

### Verified projects config

See Finding 1. Source: local Vitest 5.0.5 run; semantics from `[CITED: vitest.dev/guide/projects]`.

### Verified matrix and cache block

See Recommended Approach step 3. Matrix semantics from `[CITED: docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs]`; cache inputs from `[CITED: github.com/actions/setup-node]`.

### Verified packlist normalization and assertions

See Recommended Approach step 5. Path/index shapes from `[VERIFIED: local npm 11.19.0]`.

### Verified local YAML syntax check

```bash
ruby -ryaml -e "YAML.load_file('.github/workflows/ci.yml'); puts 'yaml syntax ok'"
```

Source: local Ruby stdlib `[VERIFIED: local run against release-smoke.yml]`. This checks syntax only; it does not validate GitHub Actions semantics.

### Verified test scripts

See Recommended Approach step 2. Positional `--project` behavior from `[VERIFIED: local Vitest 5.0.5 runs]`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vitest `workspace` file/config | `test.projects` | Deprecated since Vitest 3.2, replaced by projects | Use `projects`; `workspace` is functionally the same but deprecated `[CITED: vitest.dev/guide/projects]`. |
| Bare `vitest` as the CI/test script | `vitest run` with `test:watch` separate | Current phase | Prevents CI from entering watch mode and hanging. |
| Shell-chained suite runs | One Vitest process with projects | Current phase | One summary/exit code; chained fallback remains documented. |
| Raising `testTimeout` for flakiness | Root-cause slow import/network and pin inputs | Current phase (D-04/D-12) | Slow paths surface instead of being hidden. |
| Parsing `tar -tzf` for package membership | `npm pack --json` packlist | Current smoke script already uses it | Cheaper and authoritative; normalize array/object shape. |

**Deprecated/outdated:**
- Vitest `workspace`: deprecated in 3.2; do not introduce a `vitest.workspace.*` file.
- `feat/studio-local-first` push trigger in `release-smoke.yml`: stale branch; replacing it with `develop` is preferred (discretion D-07).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A matrix entry with `command: npm --prefix studio test` and `run: ${{ matrix.command }}` is accepted by GitHub Actions | Recommended Approach | Workflow validation fails on push; low risk because expressions in `run` and matrix `include` are documented. |
| A2 | `timeout-minutes` values (20/10/30) are sufficient for this repo's CI | Recommended Approach | A slow first run could time out; tune after the first green run. |
| A3 | Node 22 setup-node resolves to >=22.12, satisfying both `node:sqlite` and Vitest 5 | Standard Stack / Finding 2 | If it resolves to an older 22.x, the jobs fail; pin `22.12` or newer if needed. |
| A4 | Replacing the Node 20 entry with Node 24 (or a documented subset) is acceptable to the user despite D-06 | Finding 2 / Open Questions | If not acceptable, the planner must implement a Node 20-safe subset or defer the job; do not merge a red required job. |
| A5 | The Phase 2 security files will exist and be added to `files` before the smoke assertion is expected to pass | Recommended Approach | Local smoke fails until Phase 2 lands; record the dependency and rebase before verification. |

## Open Questions for the Planner (RESOLVED at plan time)

1. **How should the Node 20 matrix entry be resolved?**
   - What we know: Node 20.19.4 runs 42/43 Studio files; `agent-parsers.test.js` fails on `node:sqlite`; Vitest 5 requires Node 22.12; several Studio deps warn `EBADENGINE` on Node 20.
   - What is unclear: whether D-06's "Node 20 Studio-only" is a hard user requirement or an assumption that can be corrected.
   - Recommendation: ask the orchestrator/user to approve replacing Node 20 with Node 24 for the full suite, or approve a documented Node 20 subset. Do not silently write a red job. This is the one decision that blocks a fully green `ci.yml`.
   - Disposition: resolved by D-06 (revised) — the unit matrix runs the full `npm test` on Node 22 and Node 24; the Node 20 entry is dropped.

2. **Where should the offline dependency guard live?**
   - What we know: `pretest` must be removed; root deps cover `express`/`cors`; Studio's `fake-indexeddb` must be resolved from `studio/`.
   - What is unclear: whether adding `scripts/check-test-deps.mjs` exceeds the roadmap's "root package.json (scripts only)" ownership.
   - Recommendation: add the small ESM guard under `scripts/` and note it in VERIFICATION; fallback is a config-load guard in `vitest.config.js` (owned) with a less friendly error.
   - Disposition: resolved — the guard is exported and invoked from the owned `vitest.config.js` (D-01/D-03); no separate `scripts/check-test-deps.mjs` is added.

3. **When is the smoke-pack assertion expected to pass?**
   - What we know: `web/security.js` and `web/legacy-server.js` do not exist in this worktree; Phase 2 owns them; Phase 4 merges after Phase 2.
   - What is unclear: whether execution will rebase onto Phase 2 before running `npm run smoke:pack`.
   - Recommendation: implement the assertion and `files` entries now, but schedule local smoke verification after a Phase 2 merge/rebase; record the dependency in VERIFICATION.
   - Disposition: resolved — the synthetic assertion lands now (D-15); the full tarball smoke is deferred until Phase 2 merges and recorded as a dependency, not skipped.

4. **Should `release-smoke.yml` keep `feat/studio-local-first`?**
   - What we know: the branch is stale; `develop` is the new gate; `pull_request` already covers PRs.
   - Recommendation: replace it with `develop` (discretion permits it) to avoid duplicate/noisy runs.
   - Disposition: resolved — plan 04-02 replaces the stale branch with `develop`, keeping `main`, `pull_request`, and `workflow_dispatch` (D-07).

5. **Should the tarball job install all four package roots?**
   - What we know: the root build scripts install web/client and Studio themselves; D-08 says use `npm ci` per root and build directly.
   - Recommendation: install all four, then call package build scripts directly; this keeps the script's own install path out of CI and matches D-08.
   - Disposition: resolved — both `release-smoke.yml` jobs install with `npm ci` (tarball job: root/web/web-client/studio), build directly, then run `SMOKE_SKIP_BUILD=1 npm run smoke:pack` (D-08).

6. **Is the "one combined count" required to be machine-parseable?**
   - What we know: Vitest prints a single summary; no custom reporter is needed.
   - What is unclear: whether CI must assert the exact count or only that both suites ran.
   - Recommendation: have local validation parse the summary and compare it to the sum of separate runs; CI can rely on exit code plus the visible summary (no new reporter dependency).
   - Disposition: resolved — plan 04-01's verify uses the built-in Vitest JSON reporter to a temp file and asserts combined `numTotalTests`/`numTotalTestSuites` equals root + Studio, both non-zero; no custom reporter or new dependency is added (D-14).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js >=22.12 | Full root + Studio suite, CI unit job | Yes (local Node 26.8.1; CI installs 22) | 26.8.1 local | Node 22.x in CI; Node 24 also satisfies Vitest 5 |
| npm | Install/pack/scripts | Yes | 11.19.0 local | Node 18 runner uses bundled npm 10.x (verified dry-run) |
| Node 20.19 | Simulating the locked Studio-only job | Yes (via `npx node@20.19.4`) | 20.19.4 | Not needed if D-06 is revised |
| Node 18.20 | CLI floor simulation | Yes (via `npx node@18.20.8`) | 18.20.8 | CI `setup-node` Node 18 |
| Ruby with stdlib `yaml` | Local workflow syntax check | Yes | system Ruby | Python 3 + PyYAML |
| Python 3 + PyYAML | Optional second YAML check | Yes | system Python | Ruby stdlib |
| GitHub Actions runners | CI execution | Only on GitHub | `ubuntu-latest` | None; local checks are necessary but not sufficient for trigger/cache semantics |
| Phase 2 files (`web/security.js`, `web/legacy-server.js`) | Smoke assertion | No (not in this worktree) | — | Rebase/merge Phase 2 before smoke verification; do not stub |

**Missing dependencies with no fallback:**
- None for implementation. GitHub-hosted execution is required to prove QA-03 trigger semantics.

**Missing dependencies with fallback:**
- Phase 2 security files: fallback is to defer the local smoke assertion until the Phase 2 merge; the assertion code can land now.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (root) and 5.0.4 (Studio) |
| Config file | `vitest.config.js` (being replaced with projects); Studio standalone config lives in `studio/vite.config.js` |
| Quick run command | `npx vitest run test/cli-import.test.js test/cli-import-capstone.test.js test/cli-studio.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| QA-02 | `npm test` runs root + Studio in one non-watch pass and reports one combined count | integration (config) | `npm test` then compare the printed `Tests` total to the sum of `npx vitest run --project root` and `npm --prefix studio test` | Config change pending |
| QA-02 | `test:watch` and `test:security` scripts exist and behave distinctly | config assertion | `npm pkg get scripts.test scripts.test:watch scripts.test:security scripts.test:drift`; `npm run test:watch -- --run` (forces one pass) | Scripts pending |
| QA-03 | `ci.yml` triggers on push/PR to develop and main, with unit/security/drift jobs, timeouts, read permissions, concurrency | static + GitHub-only | Ruby YAML parse + Node/grep assertions locally; actual run on GitHub after push/PR | Workflow pending |
| QA-03 | Tarball smoke and Node 18 CLI floor still run and gain `develop` triggers | GitHub-only + local smoke | `SMOKE_SKIP_BUILD=1 npm run smoke:pack` (after builds); `node bin/cli.js --help` and `doctor` under Node 18 | Existing workflow; edits pending |
| QA-05 | Import/Studio tests pass repeatedly with default `testTimeout`, no real npm/network | stress | 30-run loop (below), with at least 10 `--maxWorkers=1`; inspect durations | Existing tests; `pretest` removal pending |
| QA-05 | No `testTimeout`/`hookTimeout` increase | static | `git diff -- vitest.config.js` must not add those keys; `npm pkg get` shows no timeout override | Config change pending |
| D-10 | Packed tarball contains `web/security.js` and `web/legacy-server.js`, no `.studio-token` | packaging | `npm pack --json` + normalized Node assertion (below) | Assertion pending; files depend on Phase 2 |

### Success Criteria → Executable Validation

| Success Criterion | Command | Fails When |
|-------------------|---------|------------|
| 1. One non-watch `npm test`, combined count, separate `test:watch`/`test:security` | `npm test`; `npm run test:watch -- --run`; `npm pkg get scripts` | `npm test` enters watch mode, prints two summaries, exits non-zero, or a script is missing/misnamed. |
| 1. Combined count is real | `npx vitest run --project root` and `npm --prefix studio test`, compare sums to `npm test` | The combined total is less than root + Studio (e.g., root project omitted) or more (duplicate collection). |
| 2. Push/PR to `develop` runs unit/security/drift with timeouts | Ruby YAML parse + grep/Node assertions locally; GitHub run after push | YAML invalid; missing `develop`/`main` triggers; missing job; missing `timeout-minutes`; missing `permissions`/`concurrency`. |
| 2. Tarball smoke + Node 18 floor reachable on `develop` | Inspect `release-smoke.yml` triggers; GitHub run | `develop` absent from push triggers; Node 18 job removed; no timeout. |
| 3. QA-05 reproduced/fixed or evidenced | 30-run loop with `--maxWorkers=1` subset | Any run exits non-zero; any test reports a 5000 ms timeout; `testTimeout` appears in the diff. |
| D-10 packaging assertion | `npm pack --json` + normalized assertion | Either security file absent; any packed basename `.studio-token`; JSON shape unhandled. |

### Sampling Rate

- **Per task commit:** `npx vitest run test/cli-import.test.js test/cli-import-capstone.test.js test/cli-studio.test.js` (fast, focused on QA-05) plus `npm pkg get scripts`.
- **Per wave merge:** `npm test` (full combined suite) and the packlist assertion.
- **Phase gate:** `npm test` green twice in a row; 30-run stress loop green; workflow YAML parses; `release-smoke.yml` inspected; smoke assertion recorded as passing or explicitly deferred to the Phase 2 dependency.

### Wave 0 Gaps

- [ ] `vitest.config.js` projects config — replaces the current single-project config; covers QA-02.
- [ ] Root `package.json` scripts (`test`, `test:watch`, `test:security`, `test:drift`, `files` additions) — covers QA-02/D-10/D-11.
- [ ] Offline dependency guard (`scripts/check-test-deps.mjs` or equivalent) — replaces `pretest`; covers D-03.
- [ ] `.github/workflows/ci.yml` — covers QA-03.
- [ ] `release-smoke.yml` trigger/timeout/direct-build edits — covers QA-03/D-07/D-08.
- [ ] `scripts/smoke-pack.mjs` packlist assertions — covers D-10.
- [ ] QA-05 stress evidence in VERIFICATION — covers QA-05.
- [ ] No new test files are required; the owned `test/cli-import*.test.js` files already exist. A new test file for the guard is optional and would need to live under `test/` to run in the root project.

## Security Domain

`security_enforcement` is enabled in `.planning/config.json` and `security_asvs_level` is 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | This phase adds no authentication surface; the pairing token already exists. |
| V3 Session Management | No | No sessions or cookies are introduced. |
| V4 Access Control | Yes | CI uses `permissions: contents: read`; no secrets; no `pull_request_target`; branch-scoped triggers. |
| V5 Input Validation | Yes | Packlist path assertions; normalized JSON shape; workflow expressions use static matrix values only, never `github.event.*` in `run`. |
| V6 Cryptography | No | The token is not generated, rotated, or stored by this phase; no crypto changes. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Pairing token included in the npm tarball (`web/.studio-token`) | Information Disclosure | Assert no packed basename `.studio-token`; `.npmignore` already excludes it; never `fs.existsSync` as the check. |
| Workflow command injection through PR-controlled strings | Elevation of Privilege / Tampering | Do not interpolate `github.event.*`, PR titles, branch names, or commit messages into `run`; matrix values are static. |
| Fork PR reading repository secrets | Information Disclosure | No repository secrets in `ci.yml`; `permissions: contents: read`; use `pull_request`, not `pull_request_target`. |
| Cache poisoning across branches/forks | Tampering | `setup-node` cache keyed by the four lockfiles; GitHub cache scope prevents fork writes to the base branch cache. |
| Over-privileged `GITHUB_TOKEN` | Elevation of Privilege | Top-level `permissions: contents: read`; do not grant write scopes for tests. |
| Untrusted test code running with publish credentials | Elevation of Privilege | Separate publish workflow is unchanged; `ci.yml` has no `NPM_TOKEN` and no `publish` step. |
| Timeout-hidden network dependency | Denial of Service / Repudiation | Remove `pretest` install; keep default `testTimeout`; stress-run to expose slow paths. |

## Sources

### Primary (HIGH confidence)

- `[CITED: https://vitest.dev/guide/projects]` — `test.projects`, inline configs, `extends` default true in Vitest 5, unique names, root config not a project, `--project` filters, nested projects.
- `[CITED: https://vitest.dev/config/#testtimeout]` — per-test `testTimeout` default 5000 ms.
- `[CITED: https://vitest.dev/guide/common-errors#project-working-directory-does-not-change]` — `process.cwd()` behavior across projects.
- `[CITED: https://docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs]` — matrix and `include` semantics.
- `[CITED: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax]` — `on.push/pull_request.branches`, `permissions`, `concurrency`, `timeout-minutes`.
- `[CITED: https://github.com/actions/setup-node]` — `cache: npm`, `cache-dependency-path`, recommended `contents: read`.
- `[CITED: https://docs.npmjs.com/cli/v11/commands/npm-pack]` — `--json` packs and writes filenames; the field schema is not documented there.
- Local Vitest 5.0.5 runs with the temporary projects config: 57 files / 666 tests, one summary `[VERIFIED: local command output]`.
- Local Vitest 5.0.5 `--project root` + positional filter and missing-file runs `[VERIFIED: local command output]`.
- Local Node 20.19.4 Studio run: 42/43 files pass, `agent-parsers.test.js` fails on `node:sqlite` `[VERIFIED: local command output]`.
- Local Node 18.20.8 + npm 10.9.4 root `npm ci --dry-run` exit 0 and CLI `--help`/`doctor` exit 0 `[VERIFIED: local command output]`.
- Local npm 11.19.0 `npm pack --json` / `--dry-run --json`: `files[].path` is `web/...`, top-level array/object variance, security files absent, token absent `[VERIFIED: local command output]`.
- In-repo values: `package.json:10-18,19-47,62-78`; `vitest.config.js:1-16`; `studio/vite.config.js:11`; `studio/package.json:13-15`; `bin/node-version.js:10`; `web/studio-db.js:17`; `web/studio-api.js:35`; `bin/commands/studio.js:149-152`; `.npmignore:19-20`; `scripts/smoke-pack.mjs:130-155`; `test/cli-import.test.js:43-47`.

### Secondary (MEDIUM confidence)

- `.planning/codebase/TESTING.md` — suite layout, mocks, fixtures, and test conventions (its Vitest version line is stale: it says root `^4.1.1`, while the installed root is 5.0.5).
- `.planning/research/ARCHITECTURE.md` § "Test / CI Topology" and `.planning/research/PITFALLS.md` Pitfall 14 — phase intent and the no-timeout-raising rule.

### Tertiary (LOW confidence)

- QA-05 root-cause ranking (pretest install vs. dynamic import vs. SQLite init). All measurements are local and the original report's command/environment is not recorded in the repo; treat the ranking as hypotheses until a repro exists.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions and engine constraints read from installed packages and the registry; no new dependencies.
- Architecture: HIGH — projects config, scripts, and CI topology were executed locally; only GitHub-only semantics remain unverified.
- Pitfalls: HIGH — the packlist path format and the Node 20 failure were reproduced; the QA-05 ranking is MEDIUM because the original flake did not reproduce.
- Validation architecture: HIGH for local commands; MEDIUM for workflow semantics that require GitHub.

**Research date:** 2026-10-22
**Valid until:** 30 days for stable tooling; re-check Vitest/Node engine floors after any lockfile change (Phase 1 owns dependency changes).
