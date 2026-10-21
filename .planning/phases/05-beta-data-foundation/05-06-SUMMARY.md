---
phase: 05-beta-data-foundation
plan: 06
subsystem: database
tags: [sqlite, indexeddb, migrations, revision-links, ddl, sha256, adapter-parity]

requires:
  - phase: 05-beta-data-foundation
    provides: explicit/inferred revision links and migration hash pinning from plans 05-01, 05-03 and 05-05
provides:
  - nullable revision_links.attempt_id in the unreleased 0005 migration, documented as "no prior attempt"
  - re-pinned 0005 SHA-256 with 0001-0004 byte-identical
  - cross-adapter proof that an explicit revisionOf with no prior attempt writes exactly one attempt_id-null link
affects: [beta instrumentation reporting, migration release, storage adapter parity]

actuals:
  tokens: 2255
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "DDL-only alignment: widen the unreleased schema to match the pure builder instead of changing the linker or adding a migration"

key-files:
  created: []
  modified:
    - studio/migrations/0005_beta_loop.sql
    - test/fixtures/migrations.sha256.json
    - test/studio-capstone-migration.test.js
    - studio/test/repo.test.js

key-decisions:
  - "Allow NULL attempt_id in the unreleased 0005 DDL instead of adding migration 0006"
  - "Keep maybeLinkRevision and buildRevisionLink unchanged; the null-when-no-prior contract was already correct"

patterns-established:
  - "Cross-adapter regressions drive the real repo write path through memory, fake-indexeddb and node:sqlite adapters"
  - "An unreleased migration edit lands in one commit with its SHA-256 re-pin and its migration integrity test"

requirements-completed: [INSTR-04, DEBT-03]

coverage:
  - id: D1
    description: "revision_links.attempt_id is nullable in the unreleased 0005 DDL with a documenting comment, and its SHA-256 pin matches while 0001-0004 stay byte-identical"
    requirement: "DEBT-03"
    verification:
      - kind: unit
        ref: "test/migrations.test.js#never lets a released migration change content"
        status: pass
      - kind: unit
        ref: "test/migrations.test.js#pins only a contiguous released prefix (never an unreleased migration)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A fresh database and a 0001-0004 upgrade both apply 0005 and accept/read a revision_links row with attempt_id null"
    requirement: "DEBT-03"
    verification:
      - kind: integration
        ref: "test/studio-capstone-migration.test.js#accepts a null attempt_id on a fresh database (explicit link without a prior attempt)"
        status: pass
      - kind: integration
        ref: "test/studio-capstone-migration.test.js#upgrades a 0001–0004 database additively, keeps rows and records 0005"
        status: pass
    human_judgment: false
  - id: D3
    description: "A quiz attempt saved with a valid explicit revisionOf and no prior attempt yields exactly one explicit link with attempt_id null on memory, IndexedDB and SQLite"
    requirement: "INSTR-04"
    verification:
      - kind: integration
        ref: "studio/test/repo.test.js#memory: stores exactly one explicit link with a null attempt_id"
        status: pass
      - kind: integration
        ref: "studio/test/repo.test.js#IndexedDB: stores exactly one explicit link with a null attempt_id"
        status: pass
      - kind: integration
        ref: "test/studio-capstone-migration.test.js#stores one explicit link with a null attempt_id when there is no prior attempt"
        status: pass
    human_judgment: false

duration: 3 min
completed: 2026-10-21
status: complete
plan_head_before: 862fb0321c80c80704ee106bc407469d5c0aa17d
plan_head_after: 6a540c42f10b9d761555f8e8a4628100ee3ba185
---

# Phase 5 Plan 06: Beta Revision-Link Gap Closure Summary

**Nullable `revision_links.attempt_id` in the unreleased 0005 migration, hash re-pinned, and one real cross-adapter regression proving an explicit `revisionOf` without a prior attempt writes exactly one `attempt_id: null` link on memory, IndexedDB and SQLite.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-21T17:25:04Z
- **Completed:** 2026-10-21T17:27:46Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Dropped `NOT NULL` from `revision_links.attempt_id` in the unreleased `0005_beta_loop.sql` and documented that NULL means there is no prior attempt to compare against (D-06/D-07).
- Recomputed the 0005 SHA-256 with the plan's exact command and re-pinned it; 0001-0004 remain byte-identical.
- Extended the migration tests so a fresh database and a 0001-0004 upgrade both store and read back a null-attempt revision link.
- Added one explicit-without-prior regression driven through `saveQuizAttempt -> maybeLinkRevision` on real memory, fake-indexeddb and `node:sqlite` adapters, proving one explicit link, one attempt and one `quiz_completed` event with no inferred link.

## Task Commits

Each task was committed atomically:

1. **Task 1: Allow NULL attempt_id in 0005 and re-pin its unreleased hash** - `d13ec53` (fix)
2. **Task 2: Prove explicit-without-prior yields one explicit link on memory, IndexedDB and SQLite** - `6a540c4` (test)

_Note: commit prefixes follow the executor prompt's hard rules (`fix(05)`, `test(05)`, `docs(05)`)._

## Files Created/Modified
- `studio/migrations/0005_beta_loop.sql` - `attempt_id TEXT` (nullable) plus the no-prior-attempt contract comment
- `test/fixtures/migrations.sha256.json` - 0005 digest re-pinned to `c0fc1dfd…dcd543`
- `test/studio-capstone-migration.test.js` - fresh/upgrade null-attempt assertions and the real SQLite `createStudioStore` regression
- `studio/test/repo.test.js` - memory and IndexedDB explicit-without-prior regression

## Decisions Made
- Edited the unreleased 0005 DDL rather than adding a 0006 migration: 0005 has not merged, so this is the last safe moment and it avoids a second migration for a schema that never shipped.
- Left `maybeLinkRevision` and `buildRevisionLink` untouched. Both already emit `attempt_id: prior?.id ?? null`; only the DDL disagreed, and the regression proves the existing linker path now works on every adapter.
- Kept the existing non-null revision link and ledger assertions in the migration test, adding the null case alongside them.

## Deviations from Plan

None - plan executed exactly as written. The existing `revision_links` count assertion in the upgrade test moved from 1 to 2 only because the plan asked for an additional null-attempt row in the same table.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Gap G-01 / MH-11 is closed: revision links are identical across memory, IndexedDB and SQLite, including the explicit-without-prior case.
- Root suite: 14 files / 347 tests passed. Studio suite: 49 files / 460 tests passed.
- No STATE.md, ROADMAP.md or CLAUDE.md edits were made, and no migration 0006 was added.

---
*Phase: 05-beta-data-foundation*
*Completed: 2026-10-21*

## Self-Check: PASSED

- All four `files_modified` entries exist on disk.
- Commits `d13ec53` and `6a540c4` are ancestors of HEAD.
