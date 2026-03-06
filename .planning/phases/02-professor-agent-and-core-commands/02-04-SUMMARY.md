---
phase: 02-professor-agent-and-core-commands
plan: "04"
subsystem: commands
tags: [plugin, claude-code, markdown, capstone, commands]

requires:
  - phase: 02-01
    provides: professor agent with Absolute Rules and command behavior specs

provides:
  - commands/professor/capstone.md — displays CAPSTONE.md with locked/unlocked contextual message
  - commands/professor/capstone-review.md — gates on all sections Done; 6-step Socratic review with verdict
  - commands/professor/note.md — coming-soon stub for Phase 3 note-taking feature
  - commands/professor/export.md — coming-soon stub for Phase 5 Notion/Obsidian export feature

affects:
  - Phase 03 (note implementation)
  - Phase 04 (pre-compact hook reads COURSE.md)
  - Phase 05 (export implementation)

tech-stack:
  added: []
  patterns:
    - "Command files contain routing/behavior instructions only — Absolute Rules live in agents/professor.md, never duplicated in commands"
    - "Stub pattern: pre-registered commands with friendly coming-soon messages prevent 'command not found' errors before their phases land"

key-files:
  created:
    - commands/professor/capstone.md
    - commands/professor/capstone-review.md
    - commands/professor/note.md
    - commands/professor/export.md
  modified: []

key-decisions:
  - "capstone-review.md gates explicitly on all sections Done before proceeding — matches SKILL.md spec and professor agent behavior"
  - "Stubs include Phase number in coming-soon message so users know when the feature lands (Phase 3 for note, Phase 5 for export)"
  - "Stubs provide manual workaround hint for note (create NOTES.md manually) to be immediately useful"

patterns-established:
  - "Gate check pattern: read COURSE.md, inspect all section statuses, respond with progress redirect if gate not met"
  - "6-step capstone review structure: read fully → overall assessment → section-by-section → standout → growth challenge → verdict"
  - "Verdict pattern: Course Complete (update COURSE.md capstone to Done) or Almost There (specify exactly what's missing)"

requirements-completed: [CMD-11, CMD-12]

duration: 2min
completed: 2026-03-06
---

# Phase 2 Plan 04: Capstone Commands and Stub Files Summary

**Capstone and capstone-review command files with gate check, 6-step review, and Course Complete/Almost There verdict; plus note and export stubs for graceful pre-registration**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T12:42:02Z
- **Completed:** 2026-03-06T12:44:09Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `capstone.md` displays CAPSTONE.md with locked vs. unlocked contextual message based on section statuses
- `capstone-review.md` gates on all sections Done, applies 6-step review, and updates COURSE.md on Course Complete verdict
- `note.md` and `export.md` are minimal stubs that give users a helpful message instead of an error for pre-registered commands

## Task Commits

Each task was committed atomically:

1. **Task 1: Write capstone and capstone-review command files** - `f818a61` (feat)
2. **Task 2: Write note and export stub files** - `cd5f232` (feat)

**Plan metadata:** (docs commit — see final_commit step)

## Files Created/Modified

- `commands/professor/capstone.md` — Reads CAPSTONE.md, checks section statuses, shows locked or unlocked contextual prompt
- `commands/professor/capstone-review.md` — Gate checks all sections Done before accepting project submission; 6-step review with Course Complete or Almost There verdict
- `commands/professor/note.md` — Stub: coming-soon message for Phase 3 note-taking feature with manual workaround hint
- `commands/professor/export.md` — Stub: coming-soon message for Phase 5 Notion/Obsidian export feature

## Decisions Made

- Gate check in capstone-review.md explicitly reads `COURSE.md` and checks every non-capstone section — matches the SKILL.md spec and the behavior already defined in agents/professor.md.
- Stubs include Phase number (Phase 3, Phase 5) so users understand the timeline without needing to read docs.
- note.md stub includes a manual workaround (create NOTES.md manually) so the feature absence doesn't block users entirely.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All 14 plugin.json-registered command names now have corresponding command files (12 functional + 2 stubs).
- Phase 3 can implement professor:note by replacing note.md with full behavior.
- Phase 4 (pre-compact hook) can proceed without dependency on any of these files.
- Phase 5 can implement professor:export by replacing export.md with full MCP behavior.

---
*Phase: 02-professor-agent-and-core-commands*
*Completed: 2026-03-06*
