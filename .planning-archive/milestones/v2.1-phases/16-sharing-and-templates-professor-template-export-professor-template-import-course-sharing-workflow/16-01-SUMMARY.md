---
phase: 16-sharing-and-templates
plan: 01
subsystem: course-sharing
tags: [template, export, import, sharing, syllabus]

# Dependency graph
requires:
  - phase: 15-retention
    provides: Course storage and progress tracking (COURSE.md, CAPSTONE.md)
provides:
  - professor:template-export command for exporting course to TEMPLATE.md
  - professor:template-import command for creating course from template
  - Plain Markdown template format (JSON frontmatter + Markdown sections)
affects: [community-sharing, template-registry]

# Tech tracking
added: []
patterns:
  - "Template format: JSON frontmatter + Markdown sections for tool-independent readability"
  - "Git worktree courses at learning/{slug}/ for course isolation"

key-files:
  created:
    - commands/professor/template-export.md
    - commands/professor/template-import.md
  modified:
    - plugin.json

key-decisions:
  - "Used JSON frontmatter for template metadata (extensible, parseable)"
  - "All imported sections marked ⬜ Not Started (fresh learner experience)"
  - "Template includes version field for future migration support"

patterns-established:
  - "Template export extracts course structure only (no notes, progress, answers)"
  - "Template import reuses new-topic workflow for course creation"

requirements-completed: [SHR-01, SHR-02, SHR-03]

# Metrics
duration: 1min
completed: 2026-03-15
---

# Phase 16 Plan 1: Template Export/Import Summary

**Template export and import commands for course sharing, enabling instructors to share learning paths without personal progress**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-15T10:24:56Z
- **Completed:** 2026-03-15T10:26:02Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Created professor:template-export command that extracts course structure to TEMPLATE.md
- Created professor:template-import command that validates template and creates new course
- Registered both commands in plugin.json for discovery

## Task Commits

Each task was committed atomically:

1. **Task 1: professor:template-export command** - `b241a6a` (feat)
2. **Task 2: professor:template-import command** - `28caeda` (feat)
3. **Task 3: Register commands in plugin.json** - `849be04` (feat)

**Plan metadata:** (to be created after SUMMARY)

## Files Created/Modified
- `commands/professor/template-export.md` - Export command that reads COURSE.md/CAPSTONE.md, writes TEMPLATE.md
- `commands/professor/template-import.md` - Import command that reads TEMPLATE.md, validates, creates course
- `plugin.json` - Added both new commands to commands array

## Decisions Made
- Used JSON frontmatter for template metadata (extensible, parseable)
- All imported sections marked ⬜ Not Started (fresh learner experience)
- Template includes version field for future migration support

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Template sharing feature complete and functional
- Ready for Phase 16-02 (if more plans in this phase) or Phase 17

---
*Phase: 16-sharing-and-templates*
*Completed: 2026-03-15*
