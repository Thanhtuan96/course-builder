---
phase: 08-when-initial-user-start-lecture-so-create-files-include-excercise-instead-of-make-user-create-new-one-exclude-coding
plan: "08-01"
subsystem: commands
tags: [exercise-files, auto-creation, socratic-learning]
dependency_graph:
  requires:
    - EXER-01
    - EXER-02
    - EXER-03
    - EXER-04
  provides:
    - Auto-creates exercise files when professor:next runs
    - Tracks active exercise in COURSE.md
    - Framework course scaffolding on new-topic
  affects:
    - commands/professor/next.md
    - commands/professor/new-topic.md
    - commands/professor/review.md
    - commands/professor/hint.md
    - commands/professor/stuck.md
    - commands/professor/done.md
tech_stack:
  added: []
  patterns:
    - Exercise file auto-creation in exercises/ subfolder
    - Active exercise field tracking in COURSE.md
    - Framework detection and scaffolding
    - Backwards compatibility with learning/ and courses/
key_files:
  created: []
  modified:
    - commands/professor/next.md
    - commands/professor/new-topic.md
    - commands/professor/review.md
    - commands/professor/hint.md
    - commands/professor/stuck.md
    - commands/professor/done.md
decisions:
  - "Exercise files use exercises/{NN}-{section-slug}.js naming pattern"
  - "Framework detection based on topic name keywords"
  - "Active exercise cleared on professor:done for clean state"
---

# Phase 8 Plan 1: Auto-Create Exercise Files Summary

## One-Liner

Auto-creates exercise template files in exercises/ subfolder when professor:next runs and tracks the active exercise in COURSE.md for seamless Socratic learning flow.

## Overview

Implemented automatic exercise file creation and tracking for the Professor plugin. When users run `professor:next`, exercise template files are automatically created in the exercises/ subfolder, and the "Active exercise" field is written to COURSE.md. The review/hint/stuck commands then read this field to load the specific exercise file.

## Tasks Completed

| Task | Name | Status |
|------|------|--------|
| 1 | Modify professor:next to auto-create exercise files + write Active exercise | ✅ Complete |
| 2 | Modify professor:new-topic for framework course scaffolding | ✅ Complete |
| 3 | Modify professor:review/hint/stuck to read Active exercise | ✅ Complete |
| 4 | Modify professor:done to clear Active exercise field | ✅ Complete |
| 5 | Backwards compatibility with learning/ and courses/ | ✅ Complete |

## Key Changes

### professor:next
- After writing LECTURE.md, determines course location (learning/{slug}/ or courses/{slug}/)
- Creates exercise file template in exercises/{NN}-{section-slug}.js
- Skips creation if file already exists (backwards compatible)
- Updates COURSE.md with "Active exercise" field

### professor:new-topic
- Detects framework/library topics based on topic name keywords
- For framework courses: scaffolds project structure in exercises/
- For standalone courses: creates empty exercises/ directory

### professor:review/hint/stuck
- Reads COURSE.md first (existing behavior)
- Checks for "Active exercise" field
- Loads the specific exercise file if field exists
- Falls back to asking user if no field found

### professor:done
- Clears "Active exercise" field when marking section complete
- Ensures no stale exercise file reference remains

## Verification

All verification commands passed:
- `commands/professor/next.md` contains exercises/ references ✅
- `commands/professor/new-topic.md` contains exercises/ references ✅
- `commands/professor/review.md` contains "Active exercise" ✅
- `commands/professor/hint.md` contains "Active exercise" ✅
- `commands/professor/stuck.md` contains "Active exercise" ✅
- `commands/professor/done.md` contains "Active exercise" ✅

## Deviations from Plan

None - plan executed exactly as written.

## Requirements Met

- [x] EXER-01: Exercise files created automatically when professor:next runs
- [x] EXER-02: Exercise files contain template/skeleton code, not working solutions
- [x] EXER-03: "Active exercise" field written to COURSE.md
- [x] EXER-04: professor:review/hint/stuck read Active exercise from COURSE.md
- [x] professor:done clears Active exercise field
- [x] Framework courses get project scaffold on new-topic
- [x] Backwards compatible with learning/ and courses/ directories
- [x] Files not overwritten if they already exist

## Metrics

- **Duration**: Started 2026-03-07T18:09:22Z
- **Files Modified**: 6
- **Commit**: 1b33c57

---

## Self-Check: PASSED

- [x] All modified files exist
- [x] Commit 1b33c57 exists
- [x] All tasks verified
- [x] All requirements met
