---
phase: 06-studio-beta-debt
plan: 01
subsystem: i18n
tags: [i18n, vite, import-meta-glob, react, render-safety]

requires:
  - phase: 01-seams-and-toolchain-prep
    provides: split hotspot modules and the Vitest 5 baseline

provides:
  - Per-namespace catalogs at studio/src/lib/i18n/<lang>/<namespace>.json (20 x 2)
  - mergeCatalogModules + eager import.meta.glob auto-merge
  - Render-safe useT (no shared-state mutation during render)
  - Per-namespace pair/parity and render-safety tests

affects: [07-beta-report-ui, 08-revision-loop-ui, 09-playwright-template]

actuals:
  tokens: 0
  tasks: 4
  commits: 1

tech-stack:
  added: []
  patterns: [Vite eager glob catalog merge, render-safe i18n hook]

key-files:
  created:
    - studio/src/lib/i18n/en/*.json (20 files)
    - studio/src/lib/i18n/vi/*.json (20 files)
    - studio/test/i18n-catalogs.test.js
    - studio/test/i18n-render.test.js
  modified:
    - studio/src/lib/i18n/index.js
    - studio/test/i18n-keys.test.js

key-decisions:
  - "D-06: i18n/<lang>/<namespace>.json with eager import.meta.glob merge"
  - "D-07: public API and key strings unchanged"
  - "D-08: useT no longer assigns module-level language during render"
  - "D-09: shared tests assert a required-namespace subset, en/vi parity, and synthetic new-namespace merge"

patterns-established:
  - "New Wave 2 namespace: add en/<ns>.json + vi/<ns>.json; no index.js or shared-test edit"

requirements-completed: [DEBT-02]

coverage:
  - id: D1
    description: "UI catalogs are split per namespace and auto-merged by an eager glob"
    requirement: DEBT-02
    verification:
      - kind: unit
        ref: "studio/test/i18n-catalogs.test.js"
        status: pass
    human_judgment: false
  - id: D2
    description: "Switching/rendering a language never mutates shared i18n state during render"
    requirement: DEBT-02
    verification:
      - kind: unit
        ref: "studio/test/i18n-render.test.js"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-10-22
status: complete
---

# Phase 6 Plan 1: i18n Namespace Split and Render-Safe useT Summary

**Studio's 1,200-line bilingual catalogs are now 40 per-namespace files auto-merged by Vite, and `useT` no longer mutates shared state while rendering.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 4
- **Files changed:** 46 (40 new JSON, 2 deleted monoliths, index.js, 3 tests)

## Accomplishments

- Moved all 20 namespaces (`common` … `errors`) verbatim into `i18n/en/*.json` and `i18n/vi/*.json`; deleted `en.json` / `vi.json`.
- Replaced static imports with `import.meta.glob('./{en,vi}/*.json', { eager: true })` and exported `mergeCatalogModules` as the testable seam.
- Removed the render-time `currentLanguage = language` assignment from `useT`; module-level `t()` now only follows explicit `setLanguage`.
- Added per-namespace pair/parity/merge tests plus render-safety tests proving `getLanguage()` and `t()` stay untouched by a render in another language.
- Used-key coverage still passes against the merged catalogs.

## Task Commits

1. **Tasks 1–4:** `39f3821` — `feat(06-01): split i18n catalogs per namespace`

## Files Created/Modified

- `studio/src/lib/i18n/index.js` — glob merge + exported `mergeCatalogModules`, render-safe `useT`
- `studio/src/lib/i18n/en/*.json`, `vi/*.json` — 40 namespace files
- `studio/src/lib/i18n/en.json`, `vi.json` — deleted
- `studio/test/i18n-catalogs.test.js`, `studio/test/i18n-render.test.js` — new
- `studio/test/i18n-keys.test.js` — per-namespace failure messages

## Decisions Made

D-06 through D-09 as locked in 06-CONTEXT.md. The shared parity test deliberately uses a subset assertion so Wave 2 can add namespaces without editing it.

## Deviations from Plan

None. The `errors` namespace was split in the same commit as the other 19 (the tracer and move were combined to keep one atomic source commit); the resulting file set and tests match the plan.

## Issues Encountered

None.

## Verification

- `npm --prefix studio test` → 45 files / 379 tests passed (baseline was 43/372).
- Focused: `i18n-catalogs`, `i18n-render`, `i18n-keys` → 9 tests passed.

## Next Phase Readiness

Wave 2 can add `betaReport`, `revision`, `runnerNotice`, `externalEvidence`, `playwrightTemplate` by dropping in `en/<ns>.json` + `vi/<ns>.json`.
