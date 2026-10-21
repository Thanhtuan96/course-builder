---
phase: 04-test-entry-and-ci-baseline
plan: 03
subsystem: release-packaging
tags: [npm-pack, tarball, security-assets, token-exclusion, smoke]

requires:
  - phase: 04-test-entry-and-ci-baseline
    plan: 01
    provides: package.json `files` entries for the two Phase 2 security assets
provides:
  - Pure `normalizePackEntries()` and `checkPacklist()` with JSDoc
  - Side-effect-free import gate for synthetic packlist checks
  - Main smoke assertion before tarball install
affects: [release-smoke, phase-02-merge]

actuals:
  tokens: 5200
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns: [packlist-membership-check, basename-token-exclusion, direct-execution-gate]

key-files:
  created: []
  modified: [scripts/smoke-pack.mjs]

key-decisions:
  - "Assert repo-relative packlist paths (`web/...`), not `package/web/...`"
  - "Normalize array and object JSON roots; support file entries or plain path strings"
  - "Only the exact `.studio-token` basename leaks; no substring matching"

patterns-established:
  - "Packaging assertions inspect the authoritative `npm pack --json` list"
  - "Smoke helpers are importable without running the smoke"

requirements-completed: [QA-03]

coverage:
  - id: D1
    description: "Synthetic good/missing/leaked packlists produce the expected `{ missing, leaked }`"
    requirement: QA-03
    verification:
      - kind: unit
        ref: "node --input-type=module synthetic check (good, 2 missing, 1 leaked, both JSON roots)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Importing the smoke module does not build/pack/install/spawn/start a server"
    verification:
      - kind: unit
        ref: "timed `import('./scripts/smoke-pack.mjs')` returned in 9 ms"
        status: pass
    human_judgment: false
  - id: D3
    description: "The main flow checks the packlist before installing the tarball"
    verification:
      - kind: unit
        ref: "line-order assertion: check at line 193, install at line 208"
        status: pass
    human_judgment: false
  - id: D4
    description: "Real tarball contains both Phase 2 security files and no token"
    requirement: QA-03
    verification: []
    human_judgment: true
    rationale: "Phase 2's files do not exist in this worktree; the real smoke is deferred until that merge. Current dry-run packlist is expected to report both missing."
  - id: D5
    description: "Current packlist reports both Phase 2 assets missing, proving the gate will fire"
    verification:
      - kind: unit
        ref: "npm pack --dry-run --json + checkPacklist → missing both, leaked []"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-10-22
status: complete
---

# Phase 4 Plan 03: Packlist Assertion Summary

**The tarball smoke now inspects the `npm pack --json` packlist, requires both Phase 2 security assets, and rejects any packed `.studio-token` — with a pure, importable check proven on synthetic data.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-10-22T01:36:00Z
- **Completed:** 2026-10-22T01:39:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `normalizePackEntries(raw)` and `checkPacklist(files)` with JSDoc, handling both array and object `npm pack --json` roots and both file-entry/string inputs.
- Gated `main()`/`cleanup()` on direct execution; importing the module returns in ~9 ms with no build, pack, install, spawn, or server.
- Wired the assertion after `npm pack --json` and before the temp-project install, with actionable missing-asset and leaked-token failures.
- Proved the gate fires on the current tree: both `web/security.js` and `web/legacy-server.js` are reported missing until Phase 2 merges.

## Task Commits

1. **Tasks 1–2: Export the pure packlist check and wire it into the real pack flow** — `da78af1` (feat)

## Files Created/Modified

- `scripts/smoke-pack.mjs` — exported normalization/check helpers, direct-execution gate, and main-flow assertion.

## Decisions Made

- The assertion checks the packed path set rather than the local filesystem, so a developer's `web/.studio-token` is irrelevant.
- Missing Phase 2 assets fail loudly; no file is stubbed and no synthetic packlist is injected into the real smoke.

## Deviations from Plan

- Tasks 1 and 2 share one file and were committed as a single cohesive `feat` commit instead of two artificial partial-file commits. Both task verifications ran independently and passed.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- After Phase 2 merges and this branch rebases, run `SMOKE_SKIP_BUILD=1 npm run smoke:pack` (after building both bundles); it should pass only with both security files packed and no token path.
- No source stub, dependency, lockfile, migration, STATE, or ROADMAP change was made.

---
*Phase: 04-test-entry-and-ci-baseline*
*Completed: 2026-10-22*
