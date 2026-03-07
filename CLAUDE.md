# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always respond in English as default, respond in the same language as the user's message.

## What This Project Is

A **Claude Code plugin** called "Professor" — a Socratic learning assistant that teaches by asking questions instead of giving answers. It is packaged as a Claude Code plugin (not a standalone app) and must be installed into `~/.claude/plugins/professor/` or symlinked there.

The plugin has no build step, no package manager, no test runner. All components are Markdown files read directly by Claude Code.

## Plugin Structure

```
plugin.json                  ← Plugin manifest (auto-discovery config)
agents/professor.md          ← Professor agent definition (not yet created)
commands/professor/          ← One .md file per professor:* command (not yet created)
hooks/pre-compact.js         ← PreCompact hook to preserve course state across context resets
professor-skill/SKILL.md     ← Legacy skill definition (source of truth for behavior)
courses/{topic-slug}/        ← Created at runtime per learner; NOT in this repo
  COURSE.md                  ← Syllabus + progress tracker (single source of truth)
  LECTURE.md                 ← Current active section (overwritten by professor:next)
  CAPSTONE.md                ← Capstone brief (immutable after creation)
```

## Plugin Manifest

`plugin.json` declares all components. Claude Code reads this file for auto-discovery:
- `agents[]` → agent files under `agents/`
- `commands[]` → command files under `commands/professor/`
- `hooks[]` → hook scripts under `hooks/`

When adding a new command or agent, register it in `plugin.json` or it won't be discovered.

## Core Behavior Rules (from professor-skill/SKILL.md)

These rules apply to the professor agent and all commands — never violate them:

1. **Never write working code** for the user — not in review, hint, discuss, or anywhere
2. **Never complete exercises** on the user's behalf under any circumstances
3. **During capstone phase**: no hints, no `professor:stuck`, no code nudges — `professor:discuss` for concepts only
4. **Always read `COURSE.md` first** at conversation start to restore context
5. **Always update `COURSE.md` immediately** when section status changes — it is the single source of truth
6. **LECTURE.md is disposable** — overwritten by each `professor:next`
7. **CAPSTONE.md is immutable** — never edit after creation

## Commands Reference

| Command | Behavior |
|---|---|
| `professor:new-topic` | Creates `COURSE.md` + `CAPSTONE.md` in `courses/{slug}/`; researches topic via web search |
| `professor:next` | Generates `LECTURE.md` for next ⬜ section; updates `COURSE.md` status to 🔄 |
| `professor:done` | Confirms understanding verbally, marks section ✅, unlocks capstone when all done |
| `professor:review` | Socratic review: what's working → question → one concept to study → next action |
| `professor:hint` | Layer 1 (conceptual) → Layer 2 (tool/pattern) → Layer 3 (pseudo-code only); no skipping |
| `professor:stuck` | Structured breakdown: what they tried → exact sticking point → smaller steps → analogy |
| `professor:discuss` | Conceptual Q&A only; no full code dumps |
| `professor:quiz` | 5 questions matched to level; Socratic review of answers |
| `professor:syllabus` | Displays `COURSE.md` |
| `professor:progress` | Reads `COURSE.md`; shows completed/current/remaining + weak areas |
| `professor:capstone` | Displays `CAPSTONE.md` |
| `professor:capstone-review` | Full project review (only after all sections ✅); still no code writing |
| `professor:note` | Saves a note to the course notes file |
| `professor:export` | Exports notes/progress to Notion or Obsidian via MCP |

## Export Feature (Optional MCP)

`professor:export` requires an MCP server running in the project environment:
- **Notion**: `@modelcontextprotocol/server-notion` with `NOTION_API_TOKEN`
- **Obsidian**: `mcp-obsidian` with `OBSIDIAN_API_KEY` + `OBSIDIAN_HOST` + `OBSIDIAN_PORT`

Configure in `.mcp.json` at project root. The core learning flow works without either.

## PreCompact Hook

`hooks/pre-compact.js` fires on the `PreCompact` event. Its job is to preserve course context so the professor can restore state after a context window reset. When implementing, it should write a summary of current course state so the next session can pick up where the user left off.

## Current Development State

Phase 1 (scaffold) is complete — directory structure and `plugin.json` exist. Phase 2 (professor agent + commands implementation) is next. The `professor-skill/SKILL.md` file is the canonical source of truth for all agent behavior and should be translated into the agent/command file structure during Phase 2.
