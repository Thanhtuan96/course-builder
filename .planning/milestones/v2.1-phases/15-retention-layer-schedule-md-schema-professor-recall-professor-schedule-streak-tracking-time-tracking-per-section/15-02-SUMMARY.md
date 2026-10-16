---
phase: 15-retention-layer
plan: 02
subsystem: learning-analytics
tags: [streak-tracking, time-tracking, retention, COURSE.md, professor]

# Dependency graph
requires:
  - phase: 15-retention-layer
    provides: SCHEDULE.md schema for spaced repetition
provides:
  - COURSE.md schema with time tracking (sectionStartedAt, sectionCompletedAt, sectionDuration)
  - COURSE.md schema with streak tracking (currentStreak, lastActiveDate)
  - professor:next command records section start time and updates streak
  - professor:done command calculates and records section duration
  - professor:progress displays streak count, total time, and time-per-section table
  - Streak logic handles yesterday/today/2+ days ago correctly
affects:
  - agents/professor.md
  - commands/professor/next.md
  - commands/professor/done.md
  - commands/professor/progress.md

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Time tracking: ISO 8601 timestamps with minute-precision duration calculation"
    - "Streak tracking: Calendar-day based streak with yesterday/today/2+days logic"
    - "Duration formatting: N min / Nh MMm format based on length"

key-files:
  created: []
  modified:
    - agents/professor.md
    - commands/professor/next.md
    - commands/professor/done.md
    - commands/professor/progress.md

key-decisions:
  - "Use ISO 8601 timestamps (YYYY-MM-DDTHH:mm:ss) for precise time tracking"
  - "Round durations to nearest minute for clean display"
  - "Streak reset after 2+ days of inactivity (not 1 day) to be forgiving"
  - "Fire emoji (🔥) for streaks ≥ 3 days for visual engagement"
  - "Progress Log includes Duration column to track time per activity"

patterns-established:
  - "Time Tracking (Internal): Dedicated section in COURSE.md for machine-readable timestamps"
  - "Streak Display: Always show in Progress Overview and on session start"
  - "Duration Calculation: sectionDuration = sectionCompletedAt - sectionStartedAt"
  - "Motivational Messaging: Context-aware encouragement based on streak status"

requirements-completed:
  - RET-03
  - RET-04

# Metrics
duration: 4min
completed: 2026-03-14
---

# Phase 15 Plan 02: Time-per-section and streak tracking Summary

**COURSE.md schema updated with time tracking fields (sectionStartedAt, sectionCompletedAt, duration) and streak tracking (currentStreak, lastActiveDate) with motivational display in professor:progress**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-14T15:12:09Z
- **Completed:** 2026-03-14T15:16:09Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments
- Updated COURSE.md schema with Progress Overview section showing current streak and last active fields
- Added Time Tracking (Internal) section with sectionStartedAt, sectionCompletedAt, and sectionDuration
- Documented Time Tracking Rules and Streak Rules in agents/professor.md
- Updated professor:next to record section start time and update streak on session start
- Updated professor:done to calculate section duration and record in Sections table and Progress Log
- Updated professor:progress to display streak count, total time invested, time-per-section table, and motivational messages

## Task Commits

Each task was committed atomically:

1. **Task 1: Update COURSE.md schema with time and streak tracking** - `1a337a8` (feat)
2. **Task 2: Update professor:next to record section start time** - `2175a4b` (feat)
3. **Task 3: Update professor:done to calculate and record time spent** - `9ce0e2f` (feat)
4. **Task 4: Update professor:progress to display streak and time stats** - `4c2748f` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `agents/professor.md` - Updated COURSE.md schema with time tracking and streak tracking fields; added Streak Check on Session Start behavior
- `commands/professor/next.md` - Added Record Section Start Time and Update Streak section with timestamp recording and streak update logic
- `commands/professor/done.md` - Added Calculate and Record Duration section with duration calculation and formatting rules
- `commands/professor/progress.md` - Added Engagement Stats, Time Per Section table, and Streak Motivation sections

## Decisions Made
- Used ISO 8601 timestamps (YYYY-MM-DDTHH:mm:ss) for precise time tracking and easy parsing
- Duration rounded to nearest minute for clean, readable display (45 min, 1h 30m)
- Streak reset after 2+ days of inactivity to be more forgiving to learners
- Fire emoji (🔥) displayed for streaks ≥ 3 days as a visual achievement indicator
- Progress Log includes Duration column to track time spent on each activity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Retention layer features complete: SCHEDULE.md (15-01) + time/streak tracking (15-02)
- Ready for Phase 16: Professor recall functionality
- All professor commands now support time and streak tracking

---
*Phase: 15-retention-layer*
*Completed: 2026-03-14*
