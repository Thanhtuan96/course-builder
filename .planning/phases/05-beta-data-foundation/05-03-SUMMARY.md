---
phase: 05-beta-data-foundation
plan: 03
subsystem: instrumentation
tags: [revision-links, beta, repository, inference, adapter-parity]

# Dependency graph
requires:
  - phase: 05-02
    provides: revisionOf parameters on attempt writes, events.js builders, memory/adapter reads
  - phase: 05-01
    provides: revision_links table, indexes and schema registry entry
provides:
  - explicit revision_links rows from caller-supplied revisionOf on all four attempt writes
  - inferred revision links per surface within an inclusive absolute 72-hour window
  - invalid or missing explicit feedback that never blocks a save and falls through to inference
  - listRevisionLinks indexed read API with one link per revised attempt
affects: [05-05, 07, 08, 09, 10]

actuals:
  tokens: 10516
  tasks: 3
  commits: 3
  plan_head_before: ae4a373
  plan_head_after: 7879e98

tech-stack:
  added: []
  patterns:
    - "Explicit-first revision linking: a valid revisionOf wins and inference never runs"
    - "One revision_links row per revised_id, checked before any explicit or inferred write"
    - "Inference compares parsed absolute timestamps with an inclusive 72-hour span"
    - "Caller table names cross into adapter reads only through the fixed four-table allowlist"

key-files:
  created:
    - studio/test/beta-revisions.test.js
  modified:
    - studio/src/lib/repo/events.js
    - studio/src/lib/repo/index.js

key-decisions:
  - "An invalid explicit revisionOf is treated as no explicit link; inference still runs and the attempt always saves (O3)."
  - "Explicit links use the latest surface-specific prior attempt but still write with attempt_id null when no prior exists."
  - "Workspace and capstone prior rows are their own feedback; quiz and tutor require a later assistant chat row."
  - "A 72-hour span is inclusive: exactly 72h links, 72h + 1s does not."
  - "listRevisionLinks forwards unknown filter keys so the adapter rejects non-indexed fields."
  - "Revision writes emit no learning event; revision counting comes from revision_links (D-02)."

patterns-established:
  - "Allowlist before adapter.get: feedback and attempt tables are validated against REVISION_FEEDBACK_TABLES"
  - "Deterministic fixture timestamps via direct adapter puts and fake system time around repo writes"

requirements-completed: [INSTR-04]

coverage:
  - id: D1
    description: "A valid explicit revisionOf stores exactly one explicit revision_links row on quiz, tutor, workspace and capstone writes with the frozen D-06 columns."
    requirement: INSTR-04
    verification:
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#stores exactly one explicit link for a quiz attempt with revisionOf"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#stores an explicit tutor link from a supplied assistant feedback row"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#stores an explicit workspace link from a supplied feedback row"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#stores an explicit capstone link from a supplied submission row"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each surface infers exactly one link from the correct prior attempt and later feedback inside the inclusive 72-hour absolute window."
    requirement: INSTR-04
    verification:
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#infers a quiz revision from a prior attempt and a later mode-review assistant message"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#infers a tutor revision from a prior user turn and a later assistant turn"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#infers a workspace revision from a prior failing run on the same lesson and file"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#infers a capstone revision from a prior submission with a verdict"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#links at exactly 72 hours and rejects 72 hours plus one second"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#compares absolute timestamps across UTC+7 and UTC-8 clocks, not calendar days"
        status: pass
    human_judgment: false
  - id: D3
    description: "All D-07 negatives create no link; invalid explicit falls through to inference without blocking the attempt; reads are indexed-only and one revised attempt has at most one link."
    requirement: INSTR-04
    verification:
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#creates no link across different lessons"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#creates no link across different capstones"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#creates no workspace link for a different file_id on the same lesson"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#creates no link when the prior attempt has no feedback"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#creates no link when feedback was created before the prior attempt"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#falls through to inference when an explicit feedback row is missing"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#ignores an unknown explicit feedback table and still infers"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#stores exactly one explicit link when explicit and inferable feedback both exist"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#keeps each revised attempt at one link across a second revision"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#rejects a non-indexed filter through the adapter parity guard"
        status: pass
      - kind: unit
        ref: "studio/test/beta-revisions.test.js#does not emit a second learning event for a revision"
        status: pass
    human_judgment: false

duration: 4 min
completed: 2026-10-22
status: complete
---

# Phase 5 Plan 03: Beta Revision Links Summary

**Explicit-first revision linking across quiz, tutor, workspace and capstone, with deterministic same-artifact inference inside an inclusive absolute 72-hour window.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-21T16:53:00Z
- **Completed:** 2026-10-21T16:57:25Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- `events.js` exports the fixed revision-table allowlist, the `explicit|inferred` kind guard and `buildRevisionLink`, which rejects unknown table names before any adapter call.
- `repo/index.js` accepts optional `revisionOf: { feedbackTable, feedbackId }` on `saveQuizAttempt`, `appendChat`, `saveRunResult` and `createCapstoneSubmission`.
- `maybeLinkRevision` writes at most one `revision_links` row per revised attempt, deriving the latest surface-specific prior attempt and the course id from the lesson or capstone.
- A valid explicit link always wins; a missing, deleted or non-allowlisted explicit feedback row is ignored, the attempt still saves, and inference runs (O3).
- Inference covers quiz and tutor chat feedback, failing workspace runs (bare array or `{checks}`) and reviewed capstone submissions, with parsed absolute timestamps and an inclusive 72-hour span.
- `listRevisionLinks` exposes indexed equality filters, orders by `created_at` ascending, hides deleted rows by default and forwards unknown keys so the adapter parity guard rejects non-indexed fields.
- Revision writes emit no second learning event; a quiz retry still records only `quiz_completed`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Store explicit revision links** - `e40e545` (feat)
2. **Task 2: Infer revision links per surface** - `6317979` (feat)
3. **Task 3: Harden revision links and read API** - `7879e98` (feat)

**Plan metadata:** pending docs commit (this SUMMARY)

## Files Created/Modified

- `studio/src/lib/repo/events.js` - revision allowlist, link-kind guard, table validation and `buildRevisionLink`
- `studio/src/lib/repo/index.js` - `revisionOf` threading, `maybeLinkRevision`, inference predicates and `listRevisionLinks`
- `studio/test/beta-revisions.test.js` - explicit links on every surface, inferred links, 72-hour/timezone boundaries, eight negatives, fallthrough and read API

## Decisions Made

- Explicit links can be written with `attempt_id: null` when a surface has no prior attempt, but still carry the supplied feedback row.
- An unknown or deleted explicit feedback row is treated exactly like no `revisionOf`: the attempt is already persisted and inference may still link.
- Prior-attempt selection sorts by `created_at` with an `id`/`attempt` tiebreak and never relies on adapter default ordering.
- `listRevisionLinks` only translates the frozen indexed fields; extra keys pass through unchanged to the adapter guard.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 8 can call `revisionOf` from the "Revise" surface without changing the frozen parameter shape.
- Phase 9 can pass capstone checkpoint links through the same write path.
- The beta report can count revisions by reading `revision_links.link_kind` and `surface`.
- Studio suite: 46 files / 412 tests passing.

---

*Phase: 05-beta-data-foundation*
*Completed: 2026-10-22*

## Self-Check: PASSED

- Created/modified files present: `events.js`, `repo/index.js`, `beta-revisions.test.js`, `05-03-SUMMARY.md`
- Task commits exist: `e40e545`, `6317979`, `7879e98`
- Measured commits: 3 (plan head `ae4a373` → `7879e98`)

