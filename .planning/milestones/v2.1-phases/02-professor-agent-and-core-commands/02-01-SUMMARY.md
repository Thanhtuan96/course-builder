---
phase: 02-professor-agent-and-core-commands
plan: "01"
subsystem: agent
tags: [claude-code-plugin, professor, socratic-learning, agent, markdown]

# Dependency graph
requires:
  - phase: 01-plugin-scaffold
    provides: plugin.json manifest with professor agent registered at agents/professor.md
provides:
  - agents/professor.md — complete professor agent system prompt with all 12 command behaviors, absolute rules, and format templates
affects:
  - 02-professor-agent-and-core-commands (plans 02–04 command files delegate to this agent)
  - 03-notes-and-progress (professor:note behavior extends from this agent)
  - 04-precompact-hook (hook needs context restoration strategy defined here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Agent-as-brain: all Socratic rules and command behaviors live in agents/professor.md only; command files are thin routing stubs with zero behavior duplication"
    - "AskUserQuestion for structured input collection (new-topic, stuck, quiz)"
    - "cwd-relative path resolution for courses/ directory — never plugin install path"

key-files:
  created:
    - agents/professor.md
  modified: []

key-decisions:
  - "All Socratic absolute rules defined in agent file only — zero duplication permitted in command files"
  - "courses/ paths always resolve from current working directory, not plugin installation directory"
  - "professor:new-topic proposes syllabus inline in chat before writing any files — user confirms first"
  - "AskUserQuestion used for: new-topic (4 questions), stuck (1 structured), quiz (scope selection)"
  - "11 absolute rules instead of 10 — added explicit cwd-relative path rule as Rule 11"

patterns-established:
  - "Agent file is the system prompt: write it as if a human expert is reading it top-to-bottom"
  - "Session start context restoration always runs first, before any other response"
  - "Capstone phase has stricter rules than course phase — locked commands enforced via agent file"

requirements-completed: [AGT-01]

# Metrics
duration: 3min
completed: 2026-03-06
---

# Phase 2 Plan 01: Professor Agent System Prompt Summary

**528-line professor agent file translating SKILL.md into a full Claude Code agent with all 12 command behaviors, 3-scenario context restoration, and 11 non-negotiable Socratic absolute rules**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T12:36:58Z
- **Completed:** 2026-03-06T12:39:52Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Wrote `agents/professor.md` as the complete professor agent system prompt — the brain for all Socratic behavior
- Translated all 12 command behaviors from SKILL.md with corrected "professor:" prefix (was "profesor:")
- Implemented 3-scenario session-start context restoration: no courses / one course / multiple courses
- Included full COURSE.md, LECTURE.md, and CAPSTONE.md format templates
- Added explicit courses/-is-cwd-relative rule as Rule 11, ensuring agents never look inside the plugin directory

## Task Commits

1. **Task 1: Write agents/professor.md** - `dd00622` (feat)

## Files Created/Modified

- `/agents/professor.md` — Full professor agent system prompt (528 lines): frontmatter (name, description, tools, color), session start protocol, file structure with cwd note, all 12 command behaviors, 3 format templates, level calibration table, 11 absolute rules

## Decisions Made

- Added Rule 11 (courses/ is cwd-relative) beyond the 10 rules in SKILL.md — this was explicitly called out in the plan task spec as a required addition
- Kept command behaviors in the agent file as full prose instructions rather than referencing command files — this is the "single source of truth" design
- AskUserQuestion for professor:stuck uses structured options ("I described it below" / "Nothing yet" / "Tried X but got Y") based on 02-CONTEXT.md specifics

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `agents/professor.md` is complete and matches the `plugin.json` registration (`"file": "agents/professor.md"`)
- Plans 02–04 can now create command files that delegate to this agent without duplicating behavior
- All command file paths are already registered in `plugin.json` — command files just need to be created at the registered paths

---
*Phase: 02-professor-agent-and-core-commands*
*Completed: 2026-03-06*
