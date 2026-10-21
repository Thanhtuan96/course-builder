---
phase: 05-beta-data-foundation
plan: 01
subsystem: database
tags: [sqlite, indexeddb, migrations, schema, beta, health]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: released migration pinning (test/migrations.test.js + migrations.sha256.json)
  - phase: 03-studio-storage
    provides: Studio SQLite adapter, TABLES registry and IndexedDB adapter
provides:
  - studios 0005_beta_loop migration with learning_events, revision_links and beta_profile
  - shared LATEST_MIGRATION_VERSION/SCHEMA_VERSION registry mirrored by IndexedDB DB_VERSION 5
  - schemaVersion derived from applied d1_migrations prefixes
  - pinned SHA-256 for 0005_beta_loop.sql
affects: [05-02, 05-03, 05-04, 05-05, 07, 08, 09, 10]

actuals:
  tokens: 6292
  tasks: 2
  commits: 2
  plan_head_before: 70d1f9e
  plan_head_after: 35a9b26

tech-stack:
  added: []
  patterns:
    - "One additive D1-compatible migration per schema change; released migrations are content-pinned"
    - "Table registry in schema.js is the single source for all adapters (no per-table adapter code)"
    - "Reported schema version is derived from the applied migration ledger, not a code literal"

key-files:
  created:
    - studio/migrations/0005_beta_loop.sql
  modified:
    - studio/src/lib/repo/schema.js
    - studio/src/lib/repo/idb-adapter.js
    - web/studio-db.js
    - test/fixtures/migrations.sha256.json
    - test/studio-api.test.js
    - test/studio-capstone-migration.test.js
    - studio/test/idb-upgrade.test.js
    - scripts/smoke-pack.mjs

key-decisions:
  - "D-12 implemented literally: LATEST_MIGRATION_VERSION = 5 is the only shared version constant; SQLite derives the reported value from d1_migrations and falls back to it."
  - "beta_profile has no secondary index because it is only ever read by its literal 'local' primary key."
  - "The v2 fixture now excludes the beta tables so it remains a genuine pre-05 database instead of trivially containing the new stores."

patterns-established:
  - "Additive migration: CREATE TABLE/INDEX IF NOT EXISTS only, no PRAGMA/ALTER, JSON as TEXT"
  - "Upgrade tests build the real prior-version fixture and prove both rows and new stores after reopening"

requirements-completed: [DEBT-03, INSTR-01]

coverage:
  - id: D1
    description: "Additive 0005 migration exposes learning_events, revision_links and beta_profile on fresh and upgraded SQLite databases, and IndexedDB upgrades v4/v2 to v5 without data loss."
    requirement: INSTR-01
    verification:
      - kind: integration
        ref: "test/studio-capstone-migration.test.js#0005_beta_loop migration"
        status: pass
      - kind: integration
        ref: "studio/test/idb-upgrade.test.js#upgrades a real v4 database to v5 and creates the three beta stores"
        status: pass
      - kind: integration
        ref: "studio/test/idb-upgrade.test.js#upgrades a v2 database to v5"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/studio/db/health, info() and exportAll() report the highest applied d1_migrations prefix (5) and the 0005 migration content is pinned."
    requirement: DEBT-03
    verification:
      - kind: integration
        ref: "test/studio-api.test.js#GET /db/health reports the SQLite file and schema version"
        status: pass
      - kind: unit
        ref: "test/studio-capstone-migration.test.js#derives the version from the highest applied prefix and ignores malformed names"
        status: pass
      - kind: unit
        ref: "test/migrations.test.js#never lets a released migration change content"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-22
status: complete
---

# Phase 5 Plan 01: Beta Data Foundation Summary

**Additive `0005_beta_loop.sql` with three beta tables, a registry shared by every adapter, IndexedDB v5, and a health route that reports the migration ledger instead of a lie.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-21T16:38:00Z (approx.)
- **Completed:** 2026-10-21T16:45:56Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- `studio/migrations/0005_beta_loop.sql` adds `learning_events`, `revision_links` and `beta_profile` with the indexes Phase 5 reads need, using only `CREATE … IF NOT EXISTS` so existing 0001–0004 databases upgrade additively.
- `schema.js` mirrors the exact DDL columns for all three tables, exports `LATEST_MIGRATION_VERSION = 5`, and keeps `SCHEMA_VERSION` as an alias; `DB_VERSION` is 5 so existing browser databases create the new object stores.
- `web/studio-db.js` derives `schemaVersion` from the highest numeric `d1_migrations` prefix (ignoring malformed names, never counting rows) and uses it in the returned value, `info()` and `exportAll()`.
- Upgrade coverage proves: a 0001–0004 SQLite database gains the three tables with rows preserved and a five-row ledger; a real v4 IndexedDB database (and the v2 regression) reopens at v5 with rows intact and the new stores usable.
- The final 0005 content is pinned in `test/fixtures/migrations.sha256.json`; released migrations 0001–0004 are byte-identical.

## Task Commits

Each task was committed atomically:

1. **Task 1: 0005 migration + registry + IDB v5** — `444cd5c` (feat)
2. **Task 2: Derived health version + pinned hash** — `35a9b26` (fix)

**Plan metadata:** pending docs commit (this SUMMARY)

## Files Created/Modified

- `studio/migrations/0005_beta_loop.sql` — three additive beta tables and their indexes
- `studio/src/lib/repo/schema.js` — `TABLES` entries, `LATEST_MIGRATION_VERSION`, `SCHEMA_VERSION`
- `studio/src/lib/repo/idb-adapter.js` — `DB_VERSION = 5` plus v5 comment
- `web/studio-db.js` — `appliedMigrationVersion()` and derived `schemaVersion`
- `test/fixtures/migrations.sha256.json` — `0005_beta_loop.sql` SHA-256
- `test/studio-api.test.js` — `/db/health` assertion 1 → 5
- `test/studio-capstone-migration.test.js` — 0005 fresh/upgrade/derivation coverage
- `studio/test/idb-upgrade.test.js` — real v4 → v5 fixture, v2 → v5 regression, fresh beta stores
- `scripts/smoke-pack.mjs` — corrected the "pinned at 1" comment

## Decisions Made

- Followed D-12 exactly: one shared version constant, with SQLite reporting what the ledger proves.
- Kept the beta registry entries minimal (no `beta_profile` index) because the singleton is read by primary key.
- Built the v2 fixture against the pre-05 store list so the regression exercises a real upgrade path.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Orchestrator Handoff Note

`scripts/smoke-pack.mjs` still says "4 migrations ship today" although 0005 makes it five. D-13 authorizes only the stale "pinned at 1" comment edit, so the sentence was intentionally left untouched; update it when the orchestrator owns that file.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- 05-02 can write `events.js` and repo emissions against the three tables and the shared `TABLES` registry.
- 05-05 can re-check schema/DDL drift across adapters; both suites are green (root 14 files/297 tests, Studio 43 files/374 tests).

---
*Phase: 05-beta-data-foundation*
*Completed: 2026-10-22*

## Self-Check: PASSED
