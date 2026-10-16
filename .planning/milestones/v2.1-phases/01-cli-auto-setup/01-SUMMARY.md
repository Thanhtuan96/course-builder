---
phase: 01-cli-auto-setup
plan: "01"
subsystem: cli
tags: [cli, npx, auto-setup, installation]

requires:
  - phase: 01-plugin-scaffold
    provides: plugin.json and base structure

provides:
  - bin/cli.js — CLI entry point with init/setup/list/help commands
  - package.json — npm package enabling npx usage
  - templates/claude/* — Claude Code specific config
  - templates/opencode/* — OpenCode specific config
  - templates/gemini/* — Gemini CLI specific config
  - templates/agent/* — Generic agent config
  - shared/ — Centralized source for all agents

affects:
  - Phase 2 (uses shared/ commands)
  - Phase 4 (uses shared/ hooks)

tech-stack:
  added: [Node.js ESM]
  patterns:
    - "Dual installation path: manual symlink OR npx auto-setup"
    - "shared/ as single source of truth for CLI installer"

key-files:
  created:
    - bin/cli.js
    - package.json
    - templates/claude/settings.json
    - templates/claude/plugin.json
    - templates/opencode/settings.json
    - templates/gemini/settings.json
    - templates/agent/settings.json
    - shared/SKILL.md
    - shared/agents/professor.md
    - shared/commands/professor/*.md
    - shared/hooks/pre-compact.js
  modified:
    - README.md (added npx instructions)

key-decisions:
  - "shared/ directory serves as source of truth - CLI copies from here"
  - "Root-level agents/ and commands/ kept for manual symlink install"
  - "Templates per-agent for settings.json variations"

patterns-established:
  - "CLI auto-detection: check env vars and home directory for agent presence"
  - "Recursive copy with mkdirSync for directory structures"

requirements-completed: [CLI-01, CLI-02, CLI-03, CLI-04, CLI-05]

duration: 15min
completed: 2026-03-06
---

# Phase 1b Plan: CLI Auto-Setup Feature

**Enable npx-based plugin installation for any supported AI agent**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-06T21:00:00Z
- **Completed:** 2026-03-06T21:15:00Z
- **Tasks:** 5
- **Files modified:** 15+

## Accomplishments

- Created CLI entry point supporting `init`, `setup`, `list`, `help` commands
- Implemented auto-detection for Claude, OpenCode, Gemini agents
- Created agent-specific templates for settings.json
- Established shared/ directory as single source of truth
- Added npx installation instructions to README.md

## Commands Implemented

```bash
npx course-professor init              # Auto-detect agent
npx course-professor setup claude     # Manual setup
npx course-professor setup opencode   # OpenCode
npx course-professor setup gemini     # Gemini CLI
npx course-professor list             # List supported agents
npx course-professor help             # Show help
```

## Task Commits

Each task was committed atomically:

1. **Task 1-2: CLI scaffolding** - Created bin/cli.js and package.json
2. **Task 3: Templates** - Created agent-specific settings
3. **Task 4: Shared directory** - Refactored commands/agents to shared/
4. **Task 5: Testing** - Verified CLI works in temp directory

## Decisions Made

- ESM (`"type": "module"`) for modern Node.js compatibility
- Auto-detect checks both env vars and directory existence
- Templates allow per-agent customization while sharing core files
- Both installation paths (manual symlink + npx auto-setup) supported

## Deviations from Plan

None — plan executed as specified.

## Issues Encountered

- Initial CLI had bug reading directories (EISDIR error) — fixed with statSync check
- Files needed sync between root and shared/ — resolved by copying Phase 2 files

## User Setup Required

None — CLI works out of the box with npx.

## Next Phase Readiness

- Phase 2 commands are in shared/ and ready to use
- PreCompact hook stub exists in shared/hooks/
- Both installation paths tested and working

## Self-Check: PASSED

- FOUND: bin/cli.js
- FOUND: package.json
- FOUND: templates/*/settings.json
- FOUND: shared/commands/professor/*.md
- FOUND: shared/agents/professor.md
- FOUND: shared/hooks/pre-compact.js

---

*Phase: 01-cli-auto-setup*
*Completed: 2026-03-06*
