---
phase: 05-beta-data-foundation
plan: 05
subsystem: testing
tags: [beta, adapter-contract, indexeddb, sqlite, backup-restore, cli-parity, vitest]

# Dependency graph
requires:
  - phase: 05-01
    provides: 0005_beta_loop migration, shared TABLE registry and DB_VERSION 5
  - phase: 05-02
    provides: repo emission points, learning_events rows and beta_profile activation
  - phase: 05-03
    provides: revision_links rows and the revisionOf explicit path
  - phase: 05-04
    provides: computeMetrics and buildBetaReport v1
provides:
  - shared adapter contract covering learning_events, revision_links and beta_profile on memory, IndexedDB, remote/SQLite and the CLI SQLite store
  - old/new backup round-trip proof plus clearAll coverage for the beta tables
  - repo-level SQLite-to-memory restore with identical metrics and report JSON
  - CLI parity through the real review/import run() entry points in a temp PROFESSOR_HOME
  - green root (345) and Studio (457) suites with the 0005 hash verified
affects: [06, 07, 08, 09, 10]

actuals:
  tokens: 6169
  tasks: 3
  commits: 2
  plan_head_before: 1ab4b679dbe02d94767d3d1747693997f48e2ca0
  plan_head_after: cbd5e71e54ba75ee5c0929cb95bfbec69c168cc3

tech-stack:
  added: []
  patterns:
    - "One shared runAdapterContract proves every beta table and index on all four storage implementations"
    - "Backup tests compute per-table counts before/after so a shared remote server DB cannot hide drift"
    - "CLI parity is proven by calling the real run() entry points in a temp PROFESSOR_HOME, keeping root CLI tests untouched"
    - "Restore comparisons sort by id because created_at can tie within a millisecond; created_at ordering is asserted separately"

key-files:
  created:
    - studio/test/beta-cli-parity.test.js
  modified:
    - studio/test/adapter-contract.test.js
    - studio/test/repo.test.js

key-decisions:
  - "The extended runAdapterContract is the single seam for memory, IndexedDB, remote and the CLI SQLite store; no adapter-specific beta tests were added."
  - "The CLI parity suite lives in studio/test/beta-cli-parity.test.js because Phase 5 owns studio/test/beta-*.test.js, while still invoking bin/commands/review.js and bin/commands/import.js run()."
  - "importAll and lesson-done are asserted emission-free through repo write paths; repeat capstone externalIds are asserted to produce one submission and one event."
  - "The report is rebuilt after a SQLite-to-memory restore with the same injected now/app/capstone inputs, so equality is meaningful rather than incidental."

patterns-established:
  - "Per-table import/export assertions compare counts relative to a captured baseline, not absolute totals"
  - "A test-only adapters with no adapter-level clearAll falls back to the inner db when the contract needs to reset state"

requirements-completed: [INSTR-01, INSTR-02, INSTR-03, INSTR-04, DEBT-03]

coverage:
  - id: D1
    description: "Every beta table and documented index behaves identically on memory, IndexedDB, remote/SQLite and the CLI SQLite store; old backups import, new backups round-trip and clearAll empties the tables."
    requirement: INSTR-01
    verification:
      - kind: integration
        ref: "studio/test/adapter-contract.test.js#exports the beta tables at schemaVersion 5 and restores every row"
        status: pass
      - kind: integration
        ref: "npx vitest run test/studio-api.test.js test/cli-studio.test.js"
        status: pass
    human_judgment: false
  - id: D2
    description: "A repo-level backup of events, an explicit revision link and the activated profile restores into memory with unchanged rows, metrics and report; one IndexedDB quiz action writes exactly one event."
    requirement: INSTR-01
    verification:
      - kind: unit
        ref: "studio/test/repo.test.js#round-trips events, revision links and the profile without changing metrics or the report"
        status: pass
      - kind: unit
        ref: "studio/test/repo.test.js#writes exactly one quiz_completed event for one saveQuizAttempt"
        status: pass
    human_judgment: false
  - id: D3
    description: "The real CLI review/import run() entry points emit one event per meaningful action in a temp PROFESSOR_HOME; a repeat capstone import emits nothing new, importAll/lesson-done emit nothing, and SQLite restores into an identical report."
    requirement: INSTR-01
    verification:
      - kind: integration
        ref: "studio/test/beta-cli-parity.test.js#imports the fixture through run() and writes one today-dated quiz event"
        status: pass
      - kind: integration
        ref: "studio/test/beta-cli-parity.test.js#restores SQLite beta rows into memory with an identical report"
        status: pass
    human_judgment: false
  - id: D4
    description: "Both complete suites pass, the 0005 migration hash matches the pinned fixture, no 0001-0004 hash changed and no out-of-scope file changed."
    requirement: DEBT-03
    verification:
      - kind: e2e
        ref: "npx vitest run && (cd studio && npx vitest run)"
        status: pass
      - kind: integration
        ref: "node -e \"...migrations.sha256.json['0005_beta_loop.sql']...\" (hash matches; fixture entry present)"
        status: pass
    human_judgment: false

duration: 3 min
completed: 2026-10-22
status: complete
---

# Phase 5 Plan 05: Beta Data Foundation Cross-Adapter and CLI Parity Summary

**Shared adapter contract and SQLite-to-memory restore prove the three beta tables, backup round-trip and real `review`/`import` CLI emission end to end.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-21T17:04:01Z
- **Completed:** 2026-10-21T17:06:55Z
- **Tasks:** 3 (2 committed, 1 verify-only)
- **Files modified:** 3

## Accomplishments

- `runAdapterContract` now proves `learning_events`, `revision_links` and `beta_profile` exist with every documented index on memory, IndexedDB, the remote server adapter and the CLI SQLite store, and that a non-indexed `meta_json` filter is rejected by every adapter.
- Old backups without the beta tables still import and leave them empty; new backups restore every row with matching per-table counts after re-export; `clearAll` empties all three tables.
- `repo.test.js` snapshots events, an explicit revision link, the activated profile, metrics and the report, then restores the dump into a fresh memory adapter and requires byte-identical inputs/outputs.
- An IndexedDB case proves one `saveQuizAttempt` writes exactly one `quiz_completed` event with the right lesson, ref id and local day.
- `beta-cli-parity.test.js` invokes the real `bin/commands/review.js` and `bin/commands/import.js` `run()` entry points in a temp `PROFESSOR_HOME`; one recall, one import-dated quiz event, one idempotent capstone checkpoint, no emission from `importAll`/lesson-done, and an identical report after SQLite→memory restore.
- The 0005 SHA-256 still matches the 05-01 pin; root (14 files / 345 tests) and Studio (49 files / 457 tests) suites are green.

## Task Commits

Each task was committed atomically:

1. **Task 1: cover new tables across adapters and backup** - `b371105` (test)
2. **Task 2: prove CLI event parity** - `cbd5e71` (test)
3. **Task 3: verify-only phase gate** - no commit (as specified)

**Plan metadata:** pending (this SUMMARY commit)

## Files Created/Modified

- `studio/test/adapter-contract.test.js` - beta-table/index/backup/clearAll coverage shared by all four adapters
- `studio/test/repo.test.js` - repo backup round-trip with metrics/report equality and the IndexedDB emission case
- `studio/test/beta-cli-parity.test.js` - real CLI `review`/`import` parity and SQLite restore report equality

## Decisions Made

- Extended the existing `runAdapterContract` seam rather than adding adapter-specific tests; the root suite exercises the same contract against the remote server and the CLI SQLite store.
- Kept the CLI parity test in the Studio suite because Phase 5 owns `studio/test/beta-*.test.js`; it still calls the real command `run()` functions instead of repo proxies.
- Compared restored rows sorted by id because `created_at` can tie within a millisecond, while asserting `created_at` ordering separately through `listEvents`.
- Rebuilt the report after restore with the same injected `now`, `app` and capstone summary so equality proves storage moved, not time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] CLI SQLite store has no adapter-level `clearAll`**
- **Found during:** Task 1 (adapter contract)
- **Issue:** `bin/studio-store.js` does not expose `clearAll` on the returned adapter, although `remote-adapter.js` documents it in the StorageAdapter contract. `bin/studio-store.js` is outside this plan's `files_modified`, so it was not edited.
- **Fix:** The contract calls `adapter.clearAll()` when present and otherwise uses the store's inner `adapter.db.clearAll()`, keeping the CLI store covered without touching an unowned file.
- **Files modified:** `studio/test/adapter-contract.test.js`
- **Verification:** `npx vitest run test/studio-api.test.js test/cli-studio.test.js` passes.
- **Committed in:** `b371105` (Task 1 commit)

**2. [Rule 1 - Test isolation] Remote factory shares one server database**
- **Found during:** Task 1 (old-backup contract)
- **Issue:** The root suite's remote factory points every `makeAdapter()` at the same server DB, so "old backup leaves the new tables empty" could see rows added by an earlier contract test.
- **Fix:** The old-backup test resets through `fresh.clearAll()` when the adapter exposes it before capturing baseline counts; per-table counts are compared before/after import.
- **Files modified:** `studio/test/adapter-contract.test.js`
- **Verification:** Root `test/studio-api.test.js` contract suite passes.
- **Committed in:** `b371105` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 test isolation)
**Impact on plan:** No product code changed and no scope creep. The first deviation documents a real contract gap in `bin/studio-store.js` for the orchestrator; the second only makes a shared-server test deterministic.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 5's beta data foundation is proven across all adapters and the CLI path; both suites are green and the released 0005 hash is current.
- `npm run smoke:pack` was not run (optional in the plan; it builds both bundles and installs the tarball, which needs the registry). The migration ships under `studio/migrations/` as before.
- Orchestrator may want to add `clearAll` to the `createStudioStore` adapter in a later plan to close the contract gap noted above.

---

*Phase: 05-beta-data-foundation*
*Completed: 2026-10-22*

## Self-Check: PASSED

All three plan files exist and both task commits are ancestors of HEAD.
