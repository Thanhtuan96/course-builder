---
phase: 07-git-worktree-courses
plan: 01
subsystem: course-management
tags: [git-worktree, courses, learning, commands]
dependency_graph:
  requires: []
  provides:
    - CMD-15: professor:worktrees command
    - CMD-16: professor:switch command
    - WORK-01: Git worktree creation
    - WORK-02: Worktree listing
    - WORK-03: Worktree switching
    - WORK-04: Worktree archiving
    - ARCH-01: Archive detection (worktree mode)
    - ARCH-02: Worktree file copy to archive
    - ARCH-03: Git worktree removal
    - ARCH-04: Branch deletion after archive
    - ARCH-05: Legacy archive compatibility
    - FILE-01: learning/ directory structure
    - FILE-02: Worktree root course files
    - FILE-03: Session restore learning/ detection
    - FILE-04: Dual-path support (learning/ + courses/)
  affects:
    - plugin.json (command registration)
    - agents/professor.md (session restoration)
    - hooks/pre-compact.js (session save)
tech_stack:
  added: []
  patterns:
    - Git worktree management (add, remove, branch deletion)
    - Dual directory course scanning
    - Worktree vs legacy course detection
key_files:
  created:
    - commands/professor/worktrees.md (new command)
    - commands/professor/switch.md (new command)
  modified:
    - commands/professor/new-topic.md (worktree creation)
    - commands/professor/archive.md (worktree archive)
    - hooks/pre-compact.js (learning/ detection)
    - plugin.json (command registration)
    - agents/professor.md (session restoration)
decisions:
  - "Learning files now live in git worktrees at learning/{slug}/ alongside user code"
  - "Session restoration prioritizes learning/ over courses/ for new courses"
  - "Archive handles both worktree and legacy modes with appropriate cleanup"
  - "Both worktrees and legacy courses can coexist for migration period"
---

# Phase 7 Plan 1: Git Worktree Courses Summary

## Overview

Implemented git worktree-based courses where each technology learned = separate git worktree at `learning/{tech-slug}/`. This allows learning files to live alongside user's project code in isolated git branches.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create professor:worktrees command | 35c4691 | commands/professor/worktrees.md |
| 2 | Create professor:switch command | 04ada29 | commands/professor/switch.md |
| 3 | Modify professor:new-topic for worktree creation | 22d6f3b | commands/professor/new-topic.md |
| 4 | Modify professor:archive for worktree removal | df6ad73 | commands/professor/archive.md |
| 5 | Modify pre-compact.js for worktree detection | 3ed5df1 | hooks/pre-compact.js |
| 6 | Update plugin.json with new commands | 77b1026 | plugin.json |
| 7 | Update professor.md session restoration | c301b4a | agents/professor.md |

## Key Changes

### New Commands

- **professor:worktrees** - Lists all learning worktrees in `learning/` directory, archived courses from `.course_archive/`, and legacy courses from `courses/`
- **professor:switch** - Switches between learning worktrees with optional slug argument or interactive selection

### Modified Commands

- **professor:new-topic** - Now creates git worktree at `learning/{slug}/` with dedicated branch `learning/{slug}`, writes COURSE.md, CAPSTONE.md, NOTES.md to worktree root
- **professor:archive** - Detects course type (learning/ vs courses/), for worktree mode: copies files to archive, runs `git worktree remove --force`, deletes branch

### Session Management

- **pre-compact.js** - `findMostRecentCourse()` now checks `learning/` first (priority), then `courses/` (legacy fallback)
- **professor.md** - Session restoration updated to check both directories, list all options, let user choose

## Deviations from Plan

None - plan executed exactly as written.

## Auth Gates

None - no authentication required for this plan.

## Verification

All verification commands passed:
- Task 1: `cat commands/professor/worktrees.md | grep -q "professor:worktrees"` ✓
- Task 2: `cat commands/professor/switch.md | grep -q "professor:switch"` ✓
- Task 3: `cat commands/professor/new-topic.md | grep -q "learning/"` ✓
- Task 4: `cat commands/professor/archive.md | grep -q "learning/"` ✓
- Task 5: `cat hooks/pre-compact.js | grep -q "learning"` ✓
- Task 6: `cat plugin.json | grep -q "worktrees"` ✓
- Task 7: `cat agents/professor.md | grep -q "learning/"` ✓

---

**Self-Check: PASSED**

All 7 tasks completed and committed. All files created/modified as specified.
