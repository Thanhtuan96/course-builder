---
planted_during: v3.0 Professor Studio (2026-10-15)
trigger_when: starting milestone v3.1 / any milestone touching the CLI, terminal learning, or a shared core package
---

# SEED-001: Professor TUI — learn entirely in the terminal

## Idea
`course-professor learn` opens a full-screen TUI: course dashboard (progress, streak, due cards) → lesson reader
(Markdown) → exercise Run/Check → streaming Socratic tutor → flashcard review. Same SQLite DB as Studio and the CLI.

## Decisions already made (user, 2026-10-15)
- Milestone v3.1 (after v3.0 ships).
- TypeScript for the new `packages/core` (extracted from studio/src/lib: repo + migrations, ai adapters, prompts,
  srs, runner, course-reader) and for the TUI. Existing Studio/CLI stay JS+JSDoc and consume core.
- Reference stack from the user: TypeScript · OpenTUI + React · Commander or cac · lessons in Markdown + YAML/JSON ·
  grading by automated tests in isolation · AI adapter incl. local models · local SQLite.

## Research outcome (`.planning/research/TUI.md`, 2026-10-15)
- **Ink 8 + React 19** (Node ≥ 22) for the v3.1 TUI. OpenTUI needs Node 26.4+ `--experimental-ffi` or Bun, so it can't
  ship reliably via `npx`; keep a `renderMarkdown()` seam in core for a later OpenTUI port.
- **Commander 15** for the TS CLI; keep `init/setup` working on Node ≥ 18 and lazy-load the TUI only for `learn`.
- Terminal Markdown: `marked` + `marked-terminal` + highlight.js; KaTeX/Mermaid → readable fallbacks.
- `packages/core` in TS via npm workspaces + tsdown, conditional exports (browser → IndexedDB, node → node:sqlite).
- Grading isolation tiers: child process + timeout (now) → WASM runtimes → containers (opt-in).

## Why This Matters
Devs live in the terminal; v3.0's Phases 26/29/30/31 already provide the DB, runners and CLI pieces the TUI needs.
