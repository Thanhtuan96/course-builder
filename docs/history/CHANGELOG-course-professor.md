# Changelog

All notable changes to **course-professor** are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **`course-professor web` now serves Studio only** by default — it starts the bridge server for
  Professor Studio (no API-key discovery, no legacy routes or UI) behind a pairing token and a
  loopback-only CORS allowlist.
- **The legacy web UI is deprecated and opt-in**: start it with `course-professor web --legacy` or
  `PROFESSOR_LEGACY=1`. `course-professor doctor` reports a failing security check while legacy
  mode is enabled.
- **Every entry point now points at Studio first** — `--help`, `init`/`setup`, `README.md` and
  `studio/README.md` send new users to `npx course-professor studio` (Node 22.5+) and describe
  `web` as the Studio bridge server.
- Added `SECURITY.md` describing what runs where (browser app, loopback bridge, local code runner)
  and how to report a vulnerability privately.

### Notes

- The `1.6.0-beta.1` note "the legacy `web` command is unchanged" no longer applies: `web` serves
  Studio only unless you opt into `--legacy` / `PROFESSOR_LEGACY=1`.

## [1.6.0-beta.1] — 2026-10-15

The "Professor Studio" line — a local-first learning platform on top of the CLI plugin. This beta
ships the whole v3.0 surface as one installable npm package. It is published under the `next` dist-tag
(install with `npx course-professor@next studio`).

### Added

- **Professor Studio** — a local-first React dashboard (courses, lessons, quizzes, flashcards, tutor
  and a code workspace) served from a single `course-professor studio` command, with one-shot pairing
  between the app and the local bridge server.
- **Local bridge server** (`web/`) — an Express API that lets the shipped Studio app stream from
  **your own** local agent. Six bridge agents are supported (Claude Code, OpenCode, Cursor Agent,
  Gemini, Ollama, OpenRouter) with per-agent model pickers and never-silent error surfacing.
- **SQLite storage** (`node:sqlite`) — the CLI (`review`, `import`) and Studio share one database
  (`~/.professor/professor.db`) through the same repository/SM-2 code paths, so progress is identical
  in the terminal and the browser. Migrations are versioned and shared with the future Cloudflare D1
  backend.
- **CLI fast-path** — `status`, `next`, `check`, `doctor`, `studio`, `review` and `import` run without
  leaving the terminal. `import` is idempotent and `review` drives SM-2 scheduling in the terminal.
- **Capstone "ship your artifact"** — a per-course capstone brief with a parsed rubric, automated
  checks, submissions, review and completion (`professor:capstone` / `professor:capstone-review`).
- **Course kinds** — courses declare a `Kind` (programming, quantitative, conceptual, skill) that
  tailors lectures, exercises, prompts and tooling.
- **Lecture archive** — archived `lectures/NN-*.md` versions are kept alongside the active
  `LECTURE.md` and imported into Studio without overwriting.
- **Grounded lectures** — the Professor and Researcher agents now follow explicit source-grounding
  rules (citations, never fabricate, SIFT verification), and the skill ships a ground-sources section.
- **Storage choice** — learners explicitly pick browser (IndexedDB) or local SQLite storage, with a
  safe switch and a browser-only banner; there is never an automatic fallback between stores.

### Changed

- The CLI help now documents the Node requirement for Studio-heavy commands.
- `web/server.js` runtime dependencies (`express`, `cors`) moved to the root package so the installed
  package needs no nested `npm install` at runtime.
- `prepublishOnly` now builds **both** the legacy web client and Studio, and the package `files`
  allowlist ships exactly what the CLI and Studio need at runtime (Studio `dist` + migrations).

### Notes

- **Studio requires Node 22.5+** (`node:sqlite`). Setup and registry commands still work on Node 18.
- **Internationalisation (i18n) is in progress** and is not part of this beta's supported surface.
- Web UI, review and import remain functional; the legacy `web` command is unchanged.

## [1.5.0] — 2026-03

- Prior stable line: Socratic plugin, multi-agent setup, git-worktree courses, registry
  install/update/remove, and the original web UI.
