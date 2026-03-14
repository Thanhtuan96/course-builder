# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always respond in English as default, respond in the same language as the user's message.

## What This Project Is

A **Claude Code plugin** called "Professor" — a Socratic learning assistant that teaches by asking questions instead of giving answers. It is packaged as a Claude Code plugin (not a standalone app) and must be installed into `~/.claude/plugins/professor/` or symlinked there.

The plugin has no build step, no package manager, no test runner. All components are Markdown files read directly by Claude Code, plus one Node.js hook script.

## Plugin Structure

```
plugin.json                  ← Plugin manifest (auto-discovery config)
agents/professor.md          ← Professor agent definition
agents/researcher.md         ← Researcher agent (Socratic research guide)
commands/professor/          ← One .md file per professor:* command
hooks/pre-compact.js         ← PreCompact hook (Node.js) — saves course state before context compression
professor-skill/SKILL.md     ← Legacy skill definition (canonical behavior reference)
learning/{topic-slug}/       ← Primary: git worktree per course (created by professor:new-topic)
  COURSE.md                  ← Syllabus + progress tracker (single source of truth)
  LECTURE.md                 ← Current active section (overwritten by professor:next)
  CAPSTONE.md                ← Capstone brief (immutable after creation)
  NOTES.md                   ← Learner notes
courses/{topic-slug}/        ← Legacy fallback: older courses not using git worktrees
.course_archive/{slug}/      ← Archived courses (created by professor:archive)
```

## Plugin Manifest

`plugin.json` declares all components. Claude Code reads this file for auto-discovery:
- `agents[]` → agent files under `agents/`
- `commands[]` → command files under `commands/professor/`
- `hooks[]` → hook scripts under `hooks/`

When adding a new command or agent, register it in `plugin.json` or it won't be discovered.

## Course Storage: Worktrees vs Legacy

New courses are created as **git worktrees** at `learning/{slug}/` with a dedicated branch `learning/{slug}`. This isolates each course's files. Older courses may exist under `courses/{slug}/` (legacy). All commands support both locations; `learning/` takes priority. `professor:new-topic` requires the user to be inside a git repository.

## Core Behavior Rules (from professor-skill/SKILL.md)

These rules apply to the professor agent and all commands — never violate them:

1. **Never write working code** for the user — not in review, hint, discuss, or anywhere
2. **Never complete exercises** on the user's behalf under any circumstances
3. **During capstone phase**: no hints, no `professor:stuck`, no code nudges — `professor:discuss` for concepts only
4. **Always read `COURSE.md` first** at conversation start to restore context (check `learning/` before `courses/`)
5. **Always update `COURSE.md` immediately** when section status changes — it is the single source of truth
6. **LECTURE.md is disposable** — overwritten by each `professor:next`
7. **CAPSTONE.md is immutable** — never edit after creation

## Commands Reference

| Command | Behavior |
|---|---|
| `professor:new-topic` | Asks 4 questions, researches topic, proposes syllabus, creates git worktree at `learning/{slug}/` with COURSE.md + CAPSTONE.md + NOTES.md |
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
| `professor:archive` | Generates SUMMARY.md, copies files to `.course_archive/{slug}/`, removes worktree and branch |
| `professor:switch` | Switches agent context to a different course in `learning/`; interactive if no slug given |
| `professor:worktrees` | Lists all active learning worktrees and archived courses with their progress |

## Agents

- **professor** (`agents/professor.md`) — main teaching agent; tools: `Read, Write, Bash, WebSearch`
- **researcher** (`agents/researcher.md`) — Socratic research guide used during course creation; tools: `WebFetch, Read, Grep, Bash`

## PreCompact Hook

`hooks/pre-compact.js` fires on the `PreCompact` event. It checks if the token count exceeds 80% of the 200k-token limit. If so, it displays a token warning, finds the most recently modified `COURSE.md` (checking `learning/` first, then `courses/`), and writes a `session_state` YAML frontmatter block with `last_active_section`, `last_updated`, and `lecture_summary` so the next session can restore context.

## Export Feature (Optional MCP)

`professor:export` requires an MCP server running in the project environment:
- **Notion**: `@modelcontextprotocol/server-notion` with `NOTION_API_TOKEN`
- **Obsidian**: `mcp-obsidian` with `OBSIDIAN_API_KEY` + `OBSIDIAN_HOST` + `OBSIDIAN_PORT`

Configure in `.mcp.json` at project root. The core learning flow works without either.
