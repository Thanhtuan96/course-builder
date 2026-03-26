# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always respond in English as default, respond in the same language as the user's message.

## What This Project Is

**Course Learning Plugin ("Professor")** — a multi-platform Socratic learning assistant that teaches by asking questions instead of giving answers. It ships as:

1. A **Claude Code plugin** installed at `~/.claude/plugins/professor/` (or symlinked)
2. An **npx CLI** (`course-professor`) for setup, registry browsing, and skill management
3. A **web UI** (React + Express) for visual learning at `localhost:3000`

The plugin's core (agents, commands, hooks) has no build step — all components are Markdown files read directly by Claude Code, plus one Node.js hook script.

## Development Commands

```bash
# CLI (no build step)
node bin/cli.js --help
node bin/cli.js init                  # Auto-detect platform and setup
node bin/cli.js setup claude          # Setup for Claude Code
node bin/cli.js list                  # List supported agents

# Tests (31 Vitest unit tests for CLI registry helpers)
npm test                              # Run all tests
npx vitest run test/cli.test.js       # Run specific test file
npx vitest --reporter=verbose         # Verbose output

# Web UI
npm run build                         # Build React client (web/client/)
npm start                             # Start Express server on :3000

# Web client dev mode
cd web/client && npm run dev          # Vite dev server
```

## Repository Structure

```
plugin.json                  <- Plugin manifest (Claude Code auto-discovery)
agents/                      <- 5 agent definitions (Markdown)
commands/professor/          <- 25 command definitions (Markdown, one per professor:* command)
hooks/pre-compact.js         <- PreCompact hook (CommonJS) — saves course state before compression
shared/                      <- Platform-neutral canonical files (tool names as placeholders)
templates/                   <- Per-platform setup templates (claude/, gemini/, cursor/, opencode/)
bin/cli.js                   <- CLI entry point (ES modules)
bin/registry-helpers.js      <- Shared CLI utilities (registry fetch, install, validate)
bin/platforms/               <- Platform detection + install logic (_shared.js, claude.js, etc.)
web/                         <- Express server + React frontend
test/cli.test.js             <- Vitest tests for registry-helpers.js
professor-skill/SKILL.md     <- Source-of-truth behavior spec for the professor agent
learning/{slug}/             <- Primary: git worktree per course (created by professor:new-topic)
courses/{slug}/              <- Legacy fallback: older courses
.course_archive/{slug}/      <- Archived courses (created by professor:archive)
```

## Plugin Manifest

`plugin.json` declares all components for Claude Code auto-discovery:
- `agents[]` → agent files under `agents/`
- `commands[]` → command files under `commands/professor/`
- `hooks[]` → hook scripts under `hooks/`

When adding a new command or agent, register it in `plugin.json` or it won't be discovered.

## Multi-Platform Architecture

The plugin supports Claude Code, Gemini CLI, OpenCode, and Cursor. Platform differences are abstracted via `bin/platforms/_shared.js`:

- Canonical files live in `shared/` using `AskUserQuestion` as a tool name placeholder
- At install time, `_shared.js` runs `substituteTokens()` to replace placeholders per platform:
  - Claude Code → `AskUserQuestion`
  - Gemini CLI → `ask_user`
  - OpenCode → `question`
  - Cursor / others → inline text response

Platform modules (`bin/platforms/claude.js`, `gemini.js`, etc.) handle detection and file placement.

## JavaScript Conventions

- `bin/cli.js` and `bin/platforms/` use **ES modules** (`import`/`export`)
- `hooks/pre-compact.js` uses **CommonJS** (`require`) for broader runtime compatibility
- 2-space indentation, semicolons, 100-char line limit
- Always use `path.join()` for paths; use `fileURLToPath(import.meta.url)` for `__dirname` in ES modules

## Course Storage: Worktrees vs Legacy

New courses are created as **git worktrees** at `learning/{slug}/` with branch `learning/{slug}`. Older courses exist under `courses/{slug}/` (legacy). All commands check `learning/` first, then fall back to `courses/`. `professor:new-topic` requires the user to be inside a git repository.

Each course directory contains:
- `COURSE.md` — syllabus + progress tracker (single source of truth, always update immediately on status change)
- `LECTURE.md` — current active section (disposable, overwritten by `professor:next`)
- `CAPSTONE.md` — project brief (immutable after creation)
- `NOTES.md` — learner notes

## Core Behavior Rules

These apply to the professor agent and all commands — never violate them:

1. **Never write working code** for the user — not in review, hint, discuss, or anywhere
2. **Never complete exercises** on the user's behalf under any circumstances
3. **During capstone phase**: no hints, no `professor:stuck`, no code nudges — `professor:discuss` for concepts only
4. **Always read `COURSE.md` first** at conversation start to restore context (check `learning/` before `courses/`)
5. **Always update `COURSE.md` immediately** when section status changes
6. **LECTURE.md is disposable** — overwritten by each `professor:next`
7. **CAPSTONE.md is immutable** — never edit after creation

## Agents

| Agent | File | Purpose |
|---|---|---|
| **professor** | `agents/professor.md` | Main teaching agent; tools: `Read, Write, Bash, WebSearch` |
| **researcher** | `agents/researcher.md` | Socratic research guide for course creation; tools: `WebFetch, Read, Grep, Bash` |
| **coach** | `agents/coach.md` | Mentoring agent for capstone phase |
| **spotter** | `agents/spotter.md` | Detects anti-patterns and learning gaps |
| **navigator** | `agents/navigator.md` | Course navigation and progression helper |

## Commands Reference

| Command | Behavior |
|---|---|
| `professor:new-topic` | Asks 4 questions, researches topic, proposes syllabus, creates git worktree at `learning/{slug}/` |
| `professor:next` | Generates `LECTURE.md` for next ⬜ section; updates `COURSE.md` status to 🔄 |
| `professor:done` | Confirms understanding verbally, marks section ✅, unlocks capstone when all done |
| `professor:review` | Socratic review: what's working → question → one concept to study → next action |
| `professor:hint` | Layer 1 (conceptual) → Layer 2 (tool/pattern) → Layer 3 (pseudo-code only); no skipping |
| `professor:stuck` | Structured breakdown: what they tried → exact sticking point → smaller steps → analogy |
| `professor:discuss` | Conceptual Q&A only; no full code dumps |
| `professor:quiz` | 5 questions matched to level; Socratic review of answers |
| `professor:recall` | Retrieves earlier concepts for spaced repetition review |
| `professor:schedule` | Displays study schedule / pacing |
| `professor:syllabus` | Displays `COURSE.md` |
| `professor:progress` | Reads `COURSE.md`; shows completed/current/remaining + weak areas |
| `professor:capstone` | Displays `CAPSTONE.md` |
| `professor:capstone-review` | Full project review (only after all sections ✅); still no code writing |
| `professor:note` | Saves a note to `NOTES.md` |
| `professor:export` | Exports notes/progress to Notion or Obsidian via MCP |
| `professor:archive` | Generates SUMMARY.md, copies to `.course_archive/{slug}/`, removes worktree and branch |
| `professor:switch` | Switches agent context to a different course in `learning/`; interactive if no slug given |
| `professor:worktrees` | Lists all active learning worktrees and archived courses with their progress |
| `professor:template-export` | Exports a course as a reusable template |
| `professor:template-import` | Imports a course from a template |
| `professor:spotter` | Delegates to the spotter agent |
| `professor:navigator` | Delegates to the navigator agent |
| `professor:skill-export` | Encodes completed capstone into a reusable `SKILL.md`; requires `COMPLETION.md` with `Course Complete` verdict |
| `professor:publish` | Publishes a course template or earned skill to the community registry via GitHub PR (`npx course-professor publish`) |

## PreCompact Hook

`hooks/pre-compact.js` fires on the `PreCompact` event. It checks if token count exceeds 80% of the 200k-token limit. If so, it finds the most recently modified `COURSE.md` (checking `learning/` first, then `courses/`) and writes a `session_state` YAML frontmatter block with `last_active_section`, `last_updated`, and `lecture_summary` so the next session can restore context.

## Adding New Features

1. Create `commands/professor/<command-name>.md` with YAML frontmatter + behavior
2. Register in `plugin.json` under `commands[]`
3. Add the canonical version in `shared/commands/professor/<command-name>.md`
4. Update this CLAUDE.md with the new command

## Export Feature (Optional MCP)

`professor:export` requires an MCP server in the project environment:
- **Notion**: `@modelcontextprotocol/server-notion` with `NOTION_API_TOKEN`
- **Obsidian**: `mcp-obsidian` with `OBSIDIAN_API_KEY` + `OBSIDIAN_HOST` + `OBSIDIAN_PORT`

Configure in `.mcp.json` at project root. The core learning flow works without either.
