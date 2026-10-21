---
phase: 05-beta-data-foundation
plan: 04
subsystem: instrumentation
tags: [beta, metrics, retention, report, zod, dst, privacy]

# Dependency graph
requires:
  - phase: 05-02
    provides: frozen EVENT_KINDS enum, learning_events rows, beta_profile activation
  - phase: 05-03
    provides: revision_links rows for surface/link-kind revision counts
provides:
  - component-based local-calendar dayNumber/dayOffset with no stored-day re-parsing
  - computeMetrics activation, 0-14 active-day window, all-time byKind and week-1/week-2 retention
  - strict schemaVersion 1 report schema and an allowlisted content-free builder
  - sentinel-proof full-report privacy test
affects: [05-05, 07, 08, 09, 10]

actuals:
  tokens: 6864
  tasks: 3
  commits: 3
  plan_head_before: 4655905
  plan_head_after: 9ac6abd

tech-stack:
  added: []
  patterns:
    - "Day keys are local calendar values; differences use Date.UTC components, never new Date(storedDay)"
    - "Only window.activeDayOffsets and retention are limited to 0-14; loops.byKind stays all-time"
    - "Builder and validator share one contract: buildBetaReport returns reportSchema.parse(candidate)"
    - "Report inputs are allowlisted field-by-field; caller objects and rows are never spread"

key-files:
  created:
    - studio/src/lib/beta/metrics.js
    - studio/src/lib/beta/report.js
    - studio/test/beta-metrics.test.js
    - studio/test/beta-report.test.js
  modified:
    - studio/test/beta-privacy.test.js

key-decisions:
  - "dayNumber parses YYYY-MM-DD components and round-trips through Date.UTC, rejecting malformed dates instead of shifting them (P2)."
  - "firstEventKind is derived from the earliest non-deleted meaningful event with an id tiebreak, not stored on beta_profile (O2)."
  - "byKind counts every meaningful event all-time, including offset 0 and offsets beyond 14 (O5); only the window and retention are 0-14."
  - "The pure beta modules import the frozen EVENT_KINDS from the pure repo/events.js module; they never import repo/index.js, an adapter or activity.js."
  - "Provider stays a category regex per D-11, so a bad provider category fails with zod 4 invalid_format while verdict/schemaVersion fail with invalid_value."

patterns-established:
  - "Pinned TZ tests set and restore process.env.TZ and build day keys from Date components, never literal YYYY-MM-DD strings"
  - "Strict-report tests flatten zod union errors so nested invalid_value codes are asserted, not only invalid_union"

requirements-completed: [INSTR-03, INSTR-02, INSTR-04]

coverage:
  - id: D1
    description: "computeMetrics derives activation, a sorted unique 0-14 active-day window, all-time byKind totals and week-1/week-2 retention from rows plus an injected clock."
    requirement: INSTR-03
    verification:
      - kind: unit
        ref: "studio/test/beta-metrics.test.js#computes the UTC+7 tracer window and keeps byKind all-time"
        status: pass
      - kind: unit
        ref: "studio/test/beta-metrics.test.js#classifies the 1-7 and 8-14 windows exactly, with 14 in and 15 out"
        status: pass
    human_judgment: false
  - id: D2
    description: "Day math never shifts a local day: UTC+7 at 06:00, UTC-8 at 23:30 and both 2026 DST transition weeks keep consecutive offsets."
    requirement: INSTR-03
    verification:
      - kind: unit
        ref: "studio/test/beta-metrics.test.js#never shifts a stored local day at 23:30 in UTC-8"
        status: pass
      - kind: unit
        ref: "studio/test/beta-metrics.test.js#walks every local day across the spring-forward week"
        status: pass
      - kind: unit
        ref: "studio/test/beta-metrics.test.js#walks every local day across the fall-back week"
        status: pass
    human_judgment: false
  - id: D3
    description: "firstEventKind comes from the earliest meaningful event, offset 0 is inclusive, pre-activation events clamp to 0, and week2MeaningfulDays counts distinct local days."
    requirement: INSTR-03
    verification:
      - kind: unit
        ref: "studio/test/beta-metrics.test.js#derives firstEventKind from the earliest event, not the profile or row order"
        status: pass
      - kind: unit
        ref: "studio/test/beta-metrics.test.js#counts distinct local days, not rows, in week 2"
        status: pass
      - kind: unit
        ref: "studio/test/beta-metrics.test.js#clamps an event before activation to offset 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "buildBetaReport returns a strict schemaVersion 1 report that rejects unknown keys at every level, requires all byKind keys and maps revision counts by surface and link kind."
    requirement: INSTR-02
    verification:
      - kind: unit
        ref: "studio/test/beta-report.test.js#rejects unknown keys inside app, loops.byKind, retention and capstone"
        status: pass
      - kind: unit
        ref: "studio/test/beta-report.test.js#requires all six byKind keys"
        status: pass
      - kind: unit
        ref: "studio/test/beta-report.test.js#counts revisions by surface and link kind, ignoring deleted rows"
        status: pass
    human_judgment: false
  - id: D5
    description: "A fully built report from sentinel course text, prompts, code, answers and an sk-live key contains none of them or any course/lesson/capstone id, URL, model name or meta."
    requirement: INSTR-04
    verification:
      - kind: unit
        ref: "studio/test/beta-privacy.test.js#builds a report with no course text, ids, URLs, model names or meta"
        status: pass
    human_judgment: false

duration: 6 min
completed: 2026-10-22
status: complete
---

# Phase 5 Plan 4: Beta Metrics and Report v1 Summary

**Component-based local-day metrics plus a strict, content-free schemaVersion 1 beta report**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-22T02:00:00Z
- **Completed:** 2026-10-22T02:06:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- `dayNumber`/`dayOffset` compute offsets from `YYYY-MM-DD` components and clamp at 0, so no stored day is ever re-parsed through `new Date()`.
- `computeMetrics` returns activation, a sorted unique 0-14 active-day window, all-time byKind totals and exact week-1 (1-7) / week-2 (8-14) retention.
- `buildBetaReport` is the single producer of the strict v1 report and calls `reportSchema.parse`, keeping producer and Phase 10 validator in lockstep.
- The sentinel privacy test now covers a fully built report, not only event rows.

## Task Commits

Each task was committed atomically:

1. **Task 1: compute activation and retention metrics** - `ced94cd` (feat)
2. **Task 2: finalize retention and loop metrics** - `ff9cada` (feat)
3. **Task 3: build strict beta report v1** - `9ac6abd` (feat)

**Plan metadata:** pending docs commit (docs: complete beta metrics and report plan)

## Files Created/Modified
- `studio/src/lib/beta/metrics.js` - pure day math, activation/window/loops/retention
- `studio/src/lib/beta/report.js` - strict zod v1 schema and allowlisted report builder
- `studio/test/beta-metrics.test.js` - UTC+7, UTC-8, both DST weeks, boundaries and firstEventKind
- `studio/test/beta-report.test.js` - strictness, enum codes, revision counts and allowlisting
- `studio/test/beta-privacy.test.js` - full-report sentinel privacy assertion

## Decisions Made
- `dayNumber` validates the literal components and round-trips through `Date.UTC`, so `2026-02-31` is malformed rather than silently normalized.
- `firstEventKind` is derived from rows (earliest `created_at`, `id` tiebreak) so `beta_profile` stays at its frozen D-08 shape.
- `byKind` counts all-time; `window.activeDayOffsets` and retention alone are 0-14 (O5).
- The beta modules import `EVENT_KINDS` from the pure `repo/events.js`; they do not import `repo/index.js`, any adapter or `activity.js`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test expectation] Provider rejection uses zod 4 `invalid_format`, not `invalid_value`**
- **Found during:** Task 3 (strict report schema)
- **Issue:** D-11 specifies `provider` as a union of `null` and a category *regex*, so a bad category is a format failure; `invalid_value` applies to the verdict/schemaVersion enums.
- **Fix:** The test asserts `invalid_format` for the provider and `invalid_value` for the verdict and schemaVersion; the schema itself is unchanged from the plan's specification.
- **Files modified:** `studio/test/beta-report.test.js`
- **Verification:** `npx vitest run test/beta-report.test.js` passes.
- **Committed in:** `9ac6abd` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 test expectation)
**Impact on plan:** No schema or behavior change. The schema matches D-11; only the assertion code for a regex-validated field was corrected.

## Issues Encountered
- The plan-level verification bullet "no `repo/` import" conflicts with Task 3's required `EVENT_KINDS` import. `beta/metrics.js` and `beta/report.js` import only the pure `repo/events.js` enum; the repository entry point, adapters and `activity.js` are not imported.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Metrics and report v1 are ready for 05-05 cross-adapter/backup verification and Phase 7 report preview/download.
- `reportSchema` is the one contract Phase 10 should reuse for import validation.

---
*Phase: 05-beta-data-foundation*
*Completed: 2026-10-22*

## Self-Check: PASSED

All five plan files exist and all three task commits are ancestors of HEAD.
