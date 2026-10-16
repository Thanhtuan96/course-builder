---
phase: 15-retention-layer
plan: 03
subsystem: retention

tags: [spaced-repetition, recall, schedule, flashcards, dashboard]

# Dependency graph
requires:
  - phase: 15-retention-layer
    provides: SCHEDULE.md schema and time/streak tracking
  - phase: 15-retention-layer
    provides: professor:done integration with SCHEDULE.md creation

provides:
  - professor:recall command for interactive spaced repetition sessions
  - professor:schedule command for read-only review dashboard
  - 3-card Socratic recall session per section
  - Self-rating system (clear/fuzzy/forgot) with interval calculations
  - Spaced repetition intervals: 1d→2d→4d→8d→16d→30d
  - Review dashboard with overdue/due-today/upcoming sections

affects:
  - commands/professor/recall.md
  - commands/professor/schedule.md
  - plugin.json

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Spaced repetition intervals: doubling on 'clear', same on 'fuzzy', reset on 'forgot'"
    - "Read-only dashboard command for safe status checking"
    - "Interactive recall session with Socratic questioning"

key-files:
  created:
    - commands/professor/recall.md
    - commands/professor/schedule.md
  modified:
    - plugin.json - Added recall and schedule command registrations

key-decisions:
  - "Self-rating with 3 options: clear, fuzzy, forgot for nuanced learning assessment"
  - "Intervals cap at 30 days to maintain retention without overwhelming gaps"
  - "Read-only schedule command prevents accidental modifications"

patterns-established:
  - "Recall sessions show due sections first, then interactive 3-card review"
  - "Dashboard uses emoji indicators (🔴🟡🟢) for quick visual scanning"
  - "Review stats include streak and upcoming review counts for motivation"

requirements-completed:
  - RET-02
  - RET-05

# Metrics
duration: 1min
completed: 2026-03-14
---

# Phase 15 Plan 03: professor:recall and professor:schedule Summary

**Interactive recall command (professor:recall) with 3-card Socratic sessions and self-rating system, plus read-only dashboard command (professor:schedule) showing overdue/due-today/upcoming reviews with streak stats.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-14T15:19:35Z
- **Completed:** 2026-03-14T15:21:03Z
- **Tasks:** 3
- **Files created:** 2
- **Files modified:** 1

## Accomplishments

- Created professor:recall command with interactive spaced repetition flow
- Implemented 3-card Socratic recall session (conceptual, application, synthesis)
- Added self-rating system (clear/fuzzy/forgot) with interval calculations
- Documented spaced repetition logic: 1d→2d→4d→8d→16d→30d intervals
- Created professor:schedule command with read-only dashboard
- Dashboard displays overdue (🔴), due-today (🟡), and upcoming (🟢) sections
- Added stats: total sections, reviews completed, mastered count, current streak
- Registered both commands in plugin.json

## Task Commits

Each task was committed atomically:

1. **Task 1: Create professor:recall command** - `ca5e799` (feat)
2. **Task 2: Create professor:schedule command** - `a9f86fc` (feat)
3. **Task 3: Register commands in plugin.json** - `75e5365` (feat)

**Plan metadata:** `TBD` (docs: complete plan)

## Files Created/Modified

- `commands/professor/recall.md` - Interactive recall session command with due section identification, 3-card Socratic review, self-rating system, and SCHEDULE.md update logic
- `commands/professor/schedule.md` - Read-only review dashboard showing overdue, due-today, and upcoming sections with priority indicators and stats
- `plugin.json` - Added professor:recall and professor:schedule command registrations

## Decisions Made

1. **Self-rating with 3 options** — clear/fuzzy/forgot provides nuanced learning assessment vs binary pass/fail
2. **30-day interval cap** — Prevents intervals from growing too large and hurting retention
3. **Read-only schedule command** — Users can safely check status without accidentally modifying data
4. **Session summary with ratings** — Shows clear/fuzzy/forgot counts to track learning trends over time

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Retention layer (Phase 15) is now complete with all three plans:
  - 15-01: SCHEDULE.md schema and professor:done integration
  - 15-02: Time-per-section and streak tracking
  - 15-03: professor:recall and professor:schedule commands
- All spaced repetition features implemented and registered
- Ready for Phase 16 or transition to v2.1 Public Launch phases

---
*Phase: 15-retention-layer*
*Completed: 2026-03-14*
