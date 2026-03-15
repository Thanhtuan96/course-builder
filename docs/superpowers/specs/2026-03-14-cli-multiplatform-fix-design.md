# CLI Multi-Platform Fix — Design Spec

**Date:** 2026-03-14
**Status:** Approved

---

## Problem

`bin/cli.js` claims to support Claude, Gemini, OpenCode, and Cursor but only Claude actually works. The other three platforms fail silently — setup completes without errors but installs the wrong files in the wrong format, and the professor commands are never loaded.

Specific bugs:

| Platform | Bug |
|---|---|
| Claude | `templates/claude/plugin.json` is outdated (missing 3 commands + researcher agent + hooks); detection uses wrong env var (`CLAUDE_API_KEY` instead of `ANTHROPIC_API_KEY`) |
| Gemini | Installs Claude Code plugin files into `.gemini/` — Gemini CLI doesn't read `plugin.json`; commands use `AskUserQuestion` (Claude-only tool); wrong detection env var |
| OpenCode | Writes `settings.json` but OpenCode reads `opencode.json`; `plugin.json` placed there is never read; `instructions` field used incorrectly |
| Cursor | Puts Claude Code plugin files in `.cursor/` — Cursor reads `.cursor/rules/*.mdc` only; `AskUserQuestion` doesn't exist in Cursor; never auto-detected |

---

## Decisions

1. **Scope:** Fix all four platforms.
2. **Command adaptation:** CLI performs token substitution at install time — `shared/` files stay clean, output is adapted per-platform.
3. **Command routing on Gemini/OpenCode:** Text-pattern triggering via a generated instruction file (`GEMINI.md` / `.opencode/professor.md`). No platform-native slash commands needed.
4. **Cursor and OpenCode interactive questions:** Both platforms lack a native structured prompt tool. Both use `null` substitution — `AskUserQuestion` is stripped and replaced with plain inline question text.
5. **Architecture:** Platform adapter modules (`bin/platforms/{platform}.js`). `cli.js` becomes a thin dispatcher.

---

## Architecture

```
bin/
  cli.js                   ← thin dispatcher; delegates to adapters
  platforms/
    _shared.js             ← shared utils: substituteTokens(), copySharedFiles()
    claude.js              ← Claude Code adapter
    gemini.js              ← Gemini CLI adapter
    opencode.js            ← OpenCode adapter
    cursor.js              ← Cursor adapter
```

Each adapter exports:
- `detect() → boolean` — whether this platform is present
- `install() → void` — performs full setup

`detectAgent()` in `cli.js` calls `detect()` on each adapter in order.
`setupAgent(agent)` calls `await adapter.install()`.

---

## Token Substitution System (`bin/platforms/_shared.js`)

```js
export const TOOL_SUBSTITUTIONS = {
  claude:   { AskUserQuestion: 'AskUserQuestion' },  // no-op
  gemini:   { AskUserQuestion: 'ask_user' },
  opencode: { AskUserQuestion: null },               // null = strip to inline text
  cursor:   { AskUserQuestion: null },               // null = strip to inline text
};
```

`substituteTokens(content, platform)`:
- For string replacements: `replaceAll(from, to)`
- For `null` values: regex-replace the tool-call instruction with `"Ask the user directly in chat:"`

`copySharedFiles(targetDir, platform)`:
- Recursively copies `shared/` into `targetDir`
- Applies `substituteTokens` to every `.md` and `.js` file

---

## Platform Adapters

### Claude (`bin/platforms/claude.js`)

**detect():** `process.env.ANTHROPIC_API_KEY` or `~/.claude` exists

**install():**
1. Create `.claude/` in cwd
2. Copy `templates/claude/` files (including synced `plugin.json`)
3. Call `copySharedFiles('.claude/', 'claude')` — no-op substitution

**Template fix:** Sync `templates/claude/plugin.json` with root `plugin.json`:
- Add commands: `professor:archive`, `professor:switch`, `professor:worktrees`
- Add agent: `researcher`
- Add hooks array: `PreCompact` hook entry (currently missing from template)

---

### Gemini (`bin/platforms/gemini.js`)

**detect():** `process.env.GEMINI_API_KEY` or `process.env.GOOGLE_API_KEY` or `~/.gemini` exists

**install():**
1. Create `.gemini/` in cwd (only for `settings.json` — no `plugin.json`, no `agents/`, no `commands/`)
2. Write `.gemini/settings.json` from `templates/gemini/settings.json` (valid Gemini CLI format, skip if exists)
3. Compile `GEMINI.md` in cwd:
   - If `GEMINI.md` already exists: append professor block between `<!-- professor:start -->` / `<!-- professor:end -->` markers, or skip if markers already present
   - If new: read `templates/gemini/GEMINI.md` (routing preamble) + append `shared/SKILL.md`
   - Apply `substituteTokens(content, 'gemini')`
   - Write to `./GEMINI.md`

**Context-window note:** Appending the full `shared/SKILL.md` (~440 lines) into `GEMINI.md` injects it into every Gemini session in that project. The routing preamble in `templates/gemini/GEMINI.md` should be a concise stub (command routing table only, ~30 lines) that references the full skill inline, keeping total addition under 100 lines.

**Files NOT written by Gemini adapter:** `plugin.json`, `agents/`, `commands/`, `hooks/` — Gemini CLI does not read any of these from `.gemini/`.

**Template to add:** `templates/gemini/GEMINI.md` — concise routing preamble (~30 lines) mapping `professor:*` text patterns to command behavior, with `ask_user` substitution applied.

---

### OpenCode (`bin/platforms/opencode.js`)

**detect():** `.opencode/` directory or `opencode.json` exists in cwd

**install():**
1. Create `.opencode/` in cwd
2. Write professor skill to `.opencode/professor.md`:
   - Read `shared/SKILL.md`, apply `substituteTokens(content, 'opencode')`
   - Write to `.opencode/professor.md` (skip if exists)
3. Read or create `.opencode/opencode.json`:
   - If exists: merge in `"instructions": [".opencode/professor.md"]`
   - If new: write from `templates/opencode/opencode.json` template (includes `instructions` entry)

**OpenCode `instructions` schema:** The field is `string[]` — an array of file paths or glob patterns relative to the project root. Content is NOT inline. Writing `.opencode/professor.md` and referencing it via `"instructions": [".opencode/professor.md"]` is the correct approach.

**Files NOT written:** `plugin.json`, `settings.json` (replaced by `opencode.json`).

**Template to add:** `templates/opencode/opencode.json`:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": [".opencode/professor.md"]
}
```

---

### Cursor (`bin/platforms/cursor.js`)

**detect():** `.cursor/` directory exists in cwd

**install():**
1. Ensure `.cursor/rules/` directory exists
2. Compile `.cursor/rules/professor.mdc`:
   - Read `templates/cursor/professor.mdc` (YAML frontmatter)
   - Append `shared/SKILL.md` content
   - Apply `substituteTokens(content, 'cursor')`
   - Write to `.cursor/rules/professor.mdc` (skip if exists)
3. Do NOT copy `plugin.json`, `agents/`, `commands/`, or `hooks/`

**Template to add:** `templates/cursor/professor.mdc` — YAML frontmatter only:
```yaml
---
description: Socratic learning assistant - professor mode
globs: ""
alwaysApply: false
---
```

---

## Detection Fix Summary

| Platform | Old detection | New detection |
|---|---|---|
| Claude | `CLAUDE_API_KEY` env or `~/.claude` | `ANTHROPIC_API_KEY` env or `~/.claude` |
| Gemini | `GEMINI_API_KEY` env or `~/.gemini` | `GEMINI_API_KEY` or `GOOGLE_API_KEY` env or `~/.gemini` |
| OpenCode | `OPENCODE_API_KEY` env (removed) | `.opencode/` dir or `opencode.json` in cwd |
| Cursor | (never detected) | `.cursor/` dir in cwd |

---

## File Change Summary

**Modify:**
- `bin/cli.js` — strip platform logic, delegate to adapters
- `templates/claude/plugin.json` — sync with root `plugin.json` (commands + researcher + hooks)

**Delete (repo-level `git rm`, not at runtime):**
- `templates/opencode/settings.json` — replaced by `templates/opencode/opencode.json`

**Create:**
- `bin/platforms/_shared.js`
- `bin/platforms/claude.js`
- `bin/platforms/gemini.js`
- `bin/platforms/opencode.js`
- `bin/platforms/cursor.js`
- `templates/gemini/GEMINI.md` (concise routing preamble, ~30 lines)
- `templates/cursor/professor.mdc` (frontmatter only)
- `templates/opencode/opencode.json`

**Unchanged:**
- `shared/` command files (substitution at install time only)
- Root `plugin.json`
- `hooks/pre-compact.js`
- `web/`

---

## Success Criteria

- `npx course-professor setup claude` → `.claude/` with correct up-to-date `plugin.json` (all 17 commands, 2 agents, PreCompact hook), loadable by Claude Code
- `npx course-professor setup gemini` → `GEMINI.md` in cwd with routing stub + professor skill, `ask_user` tool calls throughout; `.gemini/settings.json` valid; no spurious `plugin.json` in `.gemini/`
- `npx course-professor setup opencode` → `.opencode/professor.md` with professor skill (inline text questions), `.opencode/opencode.json` with valid schema referencing it
- `npx course-professor setup cursor` → `.cursor/rules/professor.mdc` with professor system prompt, inline text questions throughout; no `plugin.json` in `.cursor/`
- `npx course-professor init` → auto-detects the correct platform(s) using fixed env vars and directory checks; `cursor` is detectable for the first time
