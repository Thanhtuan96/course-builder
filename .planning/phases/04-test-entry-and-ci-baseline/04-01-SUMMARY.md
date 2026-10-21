---
phase: 04-test-entry-and-ci-baseline
plan: 01
subsystem: testing
tags: [vitest, projects, npm-scripts, determinism, offline-guard]

requires:
  - phase: 01-seams-and-toolchain-prep
    provides: Vitest 5 in both package roots and the four locked package roots
provides:
  - One non-watch `npm test` that runs root + Studio with a combined count
  - `test:watch`, `test:security`, `test:drift`
  - Offline config-load dependency guard; no npm/network in the test path
  - Pinned-clock import tests with 30-run default-timeout evidence
  - Package allowlist entries for Phase 2's security assets
affects: [ci-baseline, merge-discipline, later waves]

actuals:
  tokens: 12400
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns: [vitest-test-projects, config-load-dependency-guard, pinned-clock-tests]

key-files:
  created: []
  modified: [vitest.config.js, package.json, test/cli-import.test.js, test/cli-import-capstone.test.js]

key-decisions:
  - "Vitest 5 `test.projects` runs both suites in one process and one summary"
  - "The dependency guard lives in the owned vitest.config.js; no new script file"
  - "Node 22/24 only in CI because Vitest 5 and node:sqlite exceed the Node 20 floor"

patterns-established:
  - "One test entry: `npm test` = `vitest run`; watch is explicit"
  - "Tests pin today/now at injectable boundaries; no wall-clock or Home dependence"

requirements-completed: [QA-02, QA-05]

coverage:
  - id: D1
    description: "One non-watch `npm test` runs root + Studio and reports a combined 666-test summary"
    requirement: QA-02
    verification:
      - kind: integration
        ref: "npm test (twice: 57 files / 666 tests each)"
        status: pass
    human_judgment: false
  - id: D2
    description: "`test:watch`, `test:security`, `test:drift` exist with the locked values; `pretest` is gone"
    requirement: QA-02
    verification:
      - kind: unit
        ref: "npm pkg get scripts.test scripts.test:watch scripts.test:security scripts.test:drift"
        status: pass
    human_judgment: false
  - id: D3
    description: "Import tests pass 30 consecutive runs with default timeouts and no npm/network path"
    requirement: QA-05
    verification:
      - kind: integration
        ref: "30-run loop over cli-import/cli-import-capstone/cli-studio (10 with --maxWorkers=1)"
        status: pass
    human_judgment: false
  - id: D4
    description: "package.json `files` names both Phase 2 security assets"
    verification:
      - kind: unit
        ref: "node --input-type=module allowlist assertion"
        status: pass
    human_judgment: false

duration: 24min
completed: 2026-10-22
status: complete
---

# Phase 4 Plan 01: Unified Test Entry Summary

**One `npm test` now runs 57 files / 666 tests across root and Studio in a single non-watch pass, with an offline dependency guard and 30 green stress runs at Vitest's default timeout.**

## Performance

- **Duration:** ~24 min
- **Started:** 2026-10-22T01:28:00Z
- **Completed:** 2026-10-22T01:35:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Replaced the single-project config with two inline Vitest 5 projects (`root`, `studio`), producing one summary and one exit code.
- Locked the scripts to `vitest run` / `vitest` / filtered `--project root` calls and removed the live `npm --prefix web install` pretest.
- Added an exported, config-load `assertTestDependencies()` guard that resolves root `express`/`cors`, Studio `fake-indexeddb/auto`, and `node:sqlite`, with an actionable `npm ci` error.
- Pinned `today`/`now` at every injectable `readCourse`/`planCourseImport` boundary in the two owned import tests; left `run()` clock-free and timestamp-free.
- Proved QA-05 stability: 30 consecutive green runs (10 with `--maxWorkers=1`), 0 failures, slowest single test 30.6 ms, no 5000 ms timeout.

## Task Commits

1. **Task 1: One `npm test` runs both projects with an offline guard** — `ed89ca2` (feat)
2. **Task 2: Add the two Phase 2 security assets to the package allowlist** — `d18178c` (chore)
3. **Task 3: Pin import-test clocks and prove default-timeout stability** — `ef46012` (test)

## Files Created/Modified

- `vitest.config.js` — projects config plus the exported offline guard.
- `package.json` — locked scripts, `pretest` removed, two security `files` entries.
- `test/cli-import.test.js`, `test/cli-import-capstone.test.js` — pinned `today`/`now`.

## Decisions Made

- The guard is config-load rather than a separate `scripts/check-test-deps.mjs`, keeping the change inside the owned files.
- `run()` stays unmodified because `bin/commands/import.js` does not accept a clock and is not owned by this phase; its tests assert row counts only.
- Node 22/24 (not 20) for CI, per the verified Vitest 5 and `node:sqlite` engine floors.

## Deviations from Plan

None — plan executed as written.

## Issues Encountered

- `npm test` takes ~3–4 s because 57 workers start per file; this is import/startup cost, not a test timeout. Per-test durations stay in milliseconds.

## User Setup Required

None.

## Next Phase Readiness

- QA-02 and QA-05 are satisfied locally; CI wiring is plan 04-02.
- The package allowlist names Phase 2 assets that do not exist in this worktree yet; plan 04-03 proves the assertion and records the merge dependency.

---
*Phase: 04-test-entry-and-ci-baseline*
*Completed: 2026-10-22*
