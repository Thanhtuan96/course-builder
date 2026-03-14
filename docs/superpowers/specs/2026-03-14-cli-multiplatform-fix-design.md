# CLI Multi-Platform Fix — Design Spec

**Date:** 2026-03-14
**Status:** Approved

---

## Problem

`bin/cli.js` claims to support Claude, Gemini, OpenCode, and Cursor but only Claude actually works. The other three platforms fail silently — setup completes without errors but installs the wrong files in the wrong format, and the professor commands are never loaded.

Specific bugs:

| Platform | Bug |
|---|---|
| Claude | `templates/claude/plugin.json` is outdated (missing 3 commands + researcher agent); detection uses wrong env var (`CLAUDE_API_KEY` instead of `ANTHROPIC_API_KEY`) |
| Gemini | Installs Claude Code plugin files into `.gemini/` — Gemini CLI doesn't read `plugin.json`; commands use `AskUserQuestion` (Claude-only tool); wrong detection env var |
| OpenCode | Writes `settings.json` but OpenCode reads `opencode.json`; wrong detection env var; `plugin.json` placed there is never read |
| Cursor | Puts Claude Code plugin files in `.cursor/` — Cursor reads `.cursor/rules/*.mdc` only; `AskUserQuestion` doesn't exist in Cursor; never auto-detected |

---

## Decisions

1. **Scope:** Fix all four platforms.
2. **Command adaptation:** CLI performs token substitution at install time — `shared/` files stay clean, output is adapted per-platform.
3. **Command routing on Gemini/OpenCode:** Text-pattern triggering via a generated instruction file (`GEMINI.md` / `opencode.json` instructions field). No platform-native slash commands needed.
4. **Cursor:** Generate `.cursor/rules/professor.mdc` with the Socratic system prompt. Commands triggered by text pattern. No tool calls — `AskUserQuestion` replaced with inline text instructions.
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
  opencode: { AskUserQuestion: 'question' },
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

**Template fix:** Sync `templates/claude/plugin.json` with root `plugin.json` — add `professor:archive`, `professor:switch`, `professor:worktrees`, and the `researcher` agent entry.

---

### Gemini (`bin/platforms/gemini.js`)

**detect():** `process.env.GEMINI_API_KEY` or `process.env.GOOGLE_API_KEY` or `~/.gemini` exists

**install():**
1. Create `.gemini/` in cwd
2. Write `.gemini/settings.json` from `templates/gemini/settings.json` (valid Gemini CLI format)
3. Compile `GEMINI.md` in cwd:
   - Read `templates/gemini/GEMINI.md` (routing preamble)
   - Append `shared/SKILL.md` content
   - Apply `substituteTokens(content, 'gemini')`
   - Write to `./GEMINI.md`

**Template to add:** `templates/gemini/GEMINI.md` — routing preamble that tells the model to recognize `professor:*` text patterns and execute the corresponding command behavior.

---

### OpenCode (`bin/platforms/opencode.js`)

**detect():** `.opencode/` directory or `opencode.json` exists in cwd

**install():**
1. Create `.opencode/` in cwd
2. Read `templates/opencode/opencode.json` base template
3. Inject professor instructions (from `shared/SKILL.md`) into the `instructions` field
4. Apply `substituteTokens(content, 'opencode')`
5. Write to `.opencode/opencode.json` (merges with existing if present)

**Template to add:** `templates/opencode/opencode.json` — base config with `$schema`, `permission`, and `instructions` fields matching OpenCode's actual schema.

---

### Cursor (`bin/platforms/cursor.js`)

**detect():** `.cursor/` directory exists in cwd

**install():**
1. Ensure `.cursor/rules/` directory exists
2. Compile `.cursor/rules/professor.mdc`:
   - Read `templates/cursor/professor.mdc` (YAML frontmatter)
   - Append `shared/SKILL.md` content
   - Apply `substituteTokens(content, 'cursor')`
   - Write to `.cursor/rules/professor.mdc`
3. Do NOT copy `plugin.json`

**Template to add:** `templates/cursor/professor.mdc` — YAML frontmatter:
```yaml
---
description: Socratic learning assistant - professor mode
globs: ""
alwaysApply: false
---
```

---

## Detection Fix Summary

| Platform | Old env var | New env var |
|---|---|---|
| Claude | `CLAUDE_API_KEY` | `ANTHROPIC_API_KEY` |
| Gemini | `GEMINI_API_KEY` | `GEMINI_API_KEY` or `GOOGLE_API_KEY` |
| OpenCode | `OPENCODE_API_KEY` (removed) | directory-based only |
| Cursor | (not detected) | `.cursor/` directory check |

---

## File Change Summary

**Modify:**
- `bin/cli.js` — strip platform logic, delegate to adapters
- `templates/claude/plugin.json` — sync with root `plugin.json`

**Create:**
- `bin/platforms/_shared.js`
- `bin/platforms/claude.js`
- `bin/platforms/gemini.js`
- `bin/platforms/opencode.js`
- `bin/platforms/cursor.js`
- `templates/gemini/GEMINI.md`
- `templates/cursor/professor.mdc`
- `templates/opencode/opencode.json`

**Unchanged:**
- `shared/` command files (substitution at install time only)
- Root `plugin.json`
- `hooks/pre-compact.js`
- `web/`

---

## Success Criteria

- `npx course-professor setup claude` → `.claude/` with correct up-to-date `plugin.json`, professor commands and researcher agent loadable by Claude Code
- `npx course-professor setup gemini` → `GEMINI.md` in cwd with routing table + professor skill, `ask_user` tool calls throughout
- `npx course-professor setup opencode` → `.opencode/opencode.json` with valid schema and professor instructions, `question` tool calls throughout
- `npx course-professor setup cursor` → `.cursor/rules/professor.mdc` with professor system prompt, inline text questions throughout
- `npx course-professor init` → auto-detects the correct platform(s) using fixed env vars and directory checks
