---
phase: 04-test-entry-and-ci-baseline
plan: 02
subsystem: ci
tags: [github-actions, matrix, caching, concurrency, release-smoke, node18]

requires:
  - phase: 04-test-entry-and-ci-baseline
    plan: 01
    provides: locked `npm test`/`test:security`/`test:drift` scripts and the config-load guard
  - phase: 04-test-entry-and-ci-baseline
    plan: 03
    provides: the packlist assertion the tarball job will exercise
provides:
  - New `ci.yml` with unit (Node 22/24), security, and drift jobs on develop/main
  - `develop` trigger, timeouts, caching, and direct builds in `release-smoke.yml`
  - Node 18 CLI floor preserved
affects: [merge-discipline, later waves, release-readiness]

actuals:
  tokens: 6800
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns: [matrix-include, setup-node-npm-cache, concurrency-cancel, direct-package-builds]

key-files:
  created: [.github/workflows/ci.yml]
  modified: [.github/workflows/release-smoke.yml]

key-decisions:
  - "Unit matrix runs the full `npm test` on Node 22 and 24; Node 20 is not viable for Vitest 5"
  - "No duplicate tarball smoke in ci.yml; release-smoke keeps it and gains `develop`"
  - "Every npm-ci job uses setup-node caching keyed by all four lockfiles"
  - "Security/drift are intentionally red until Phases 2/3 merge; no escape hatch"

patterns-established:
  - "CI installs each needed package root with `npm ci` before running Vitest"
  - "Release smoke builds packages directly to avoid npm-install inside build aliases"

requirements-completed: [QA-03]

coverage:
  - id: D1
    description: "Push/PR to develop or main runs unit on Node 22 and 24 with root + Studio installs"
    requirement: QA-03
    verification:
      - kind: unit
        ref: "Ruby YAML parse + trigger/matrix/install/cache assertions"
        status: pass
    human_judgment: false
  - id: D2
    description: "Security and drift jobs run their locked scripts with root + Studio installs and a pre-merge note"
    requirement: QA-03
    verification:
      - kind: unit
        ref: "Ruby jobs/step assertions + drift/security install check"
        status: pass
    human_judgment: false
  - id: D3
    description: "release-smoke gains develop, timeouts/cache on both jobs, four-root installs, direct builds, build-skipped smoke"
    requirement: QA-03
    verification:
      - kind: unit
        ref: "Ruby YAML parse + trigger/cache/install/build/smoke assertions"
        status: pass
    human_judgment: false
  - id: D4
    description: "Actual GitHub trigger, cache, matrix, and job results"
    requirement: QA-03
    verification: []
    human_judgment: true
    rationale: "GitHub Actions semantics (trigger firing, cache hits, matrix expansion, job status) cannot be executed locally; only YAML syntax and static structure were verified. Confirm on the first pushed PR."
  - id: D5
    description: "Node 18 CLI floor still runs --help and doctor"
    requirement: QA-03
    verification:
      - kind: unit
        ref: "static assertion on release-smoke.yml"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-10-22
status: complete
---

# Phase 4 Plan 02: CI Baseline Summary

**A new develop-gated CI workflow runs the full suite on Node 22 and 24 plus security/drift jobs, while release-smoke gains `develop`, bounded jobs, four-root `npm ci`, direct builds, and the Node 18 CLI floor.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-22T01:39:00Z
- **Completed:** 2026-10-22T01:43:00Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Added `.github/workflows/ci.yml` with `push`/`pull_request` on `develop` and `main`, read-only permissions, cancel-in-progress concurrency, and job timeouts.
- Unit job: Node 22/24 matrix, four-lockfile npm cache, root + Studio `npm ci`, then `npm test`.
- Security and drift jobs: Node 22, root + Studio installs (the drift job needs Studio because the config-load guard runs before project filtering), locked scripts, and an explicit Phase 2/3 pre-merge comment.
- `release-smoke.yml`: `develop` replaces the stale feature branch, both jobs gain timeouts and cache, the tarball job installs all four roots and builds directly, then `SMOKE_SKIP_BUILD=1 npm run smoke:pack`; the Node 18 CLI floor runs `npm ci --omit=dev`, `--help`, and `doctor`.

## Task Commits

1. **Task 1: Unit CI matrix** — `af29afc` (feat)
2. **Task 2: Security + drift jobs** — `0ee99c4` (feat)
3. **Task 3: release-smoke develop/direct builds** — `a59f241` (ci)

## Files Created/Modified

- `.github/workflows/ci.yml` — new unit/security/drift workflow.
- `.github/workflows/release-smoke.yml` — develop trigger, timeouts, cache, installs, direct builds, build-skipped smoke.

## Decisions Made

- Node 24 replaces Node 20 after research showed the Studio suite and Vitest 5 exceed the Node 20 floor.
- Security/drift stay honestly red until their owning phases merge; no `--passWithNoTests`, no `continue-on-error`.
- The tarball smoke is not duplicated in `ci.yml`.

## Deviations from Plan

None — plan executed as written.

## Issues Encountered

- GitHub-only semantics (actual triggers, cache, matrix, job status) cannot be proven locally; recorded as a manual follow-up in VERIFICATION.

## User Setup Required

None.

## Next Phase Readiness

- The CI baseline is structurally complete; the first pushed PR should confirm trigger, cache, and matrix behavior.
- The tarball job will fail loudly until Phase 2 supplies `web/security.js` and `web/legacy-server.js`; that is intentional and recorded.
- Security/drift jobs go green when Phases 2 and 3 merge.

---
*Phase: 04-test-entry-and-ci-baseline*
*Completed: 2026-10-22*
