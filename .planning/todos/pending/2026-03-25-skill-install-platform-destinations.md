---
created: 2026-03-25T00:00:00.000Z
title: Skill install destination per non-CC platforms
area: cli
files:
  - bin/cli.js
priority: P3
effort: L
---

## Problem

The `install --skill` command currently hardcodes `.claude/skills/{name}/` as the local destination and `~/.claude/skills/{name}/` as the global destination. These are Claude Code-specific paths. A Gemini CLI, OpenCode, or Cursor user who runs `install --skill` gets the skill files in a directory their platform does not read. The current success message also says "It will be available to Claude Code in this project automatically" — which is accurate but may confuse multi-platform users.

## Solution

When skill format conventions stabilize for Gemini CLI, OpenCode, and Cursor, route `install --skill` to the appropriate platform-specific directory. Possible approach:

1. Detect active platform (same `detectAgent()` mechanism used for `init`)
2. Route skill to platform-specific skill dir:
   - Claude Code: `.claude/skills/{name}/` (current)
   - Gemini CLI: TBD (likely `~/.gemini/extensions/{name}/` or `.gemini/skills/{name}/`)
   - OpenCode: TBD (likely `~/.opencode/skills/{name}/`)
   - Cursor: TBD (likely `.cursor/rules/{name}.mdc` or `.cursorrules/`)
3. Adjust success message accordingly

## Dependencies

- Platform skill format conventions are not yet standardized for Gemini CLI, OpenCode, or Cursor — revisit when those ecosystems mature
- Blocked by: external platform decisions

## Why deferred

Skills are Claude Code-native concepts for now. The earned-gate model (complete course + capstone to unlock skill) is also most mature in Claude Code. Multi-platform skill install is v3.x territory.
