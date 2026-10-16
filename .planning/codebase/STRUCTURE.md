---
last_mapped_commit: 23bc7fcb6e5197d01731ffb36dc0f2d3628cef67
last_mapped_at: 2026-10-17
---
# Codebase Structure

**Analysis Date:** 2026-10-17

## Directory Layout

```
course-learning-plugin/                 # Repo root (npm package "course-professor")
├── agents/                             # Claude Code agent specs (Markdown): professor, researcher, coach, spotter, navigator
├── commands/professor/                 # 26 slash-command specs (Markdown), one per professor:* command
├── professor-skill/                    # SKILL.md — source-of-truth behavior spec for the professor agent
├── shared/                             # Generated platform-neutral mirror of agents/, commands/, hooks/ (+ SKILL.md)
├── hooks/                              # pre-compact.js (CommonJS PreCompact hook)
├── templates/                          # Per-platform install templates: claude/, gemini/, cursor/, opencode/, agent/, researcher/
├── resources/                          # static-research.md (reference material)
├── bin/                                # npx CLI (ES modules): cli.js entry, commands/, platforms/, shared helpers
├── web/                                # Express server (server.js, studio-api.js, studio-db.js, studio-runner.js, lecture-archive.js) + legacy client
│   └── client/                         # Legacy React + Vite UI (src/, vite.config.js, components.json)
├── studio/                             # "Professor Studio" Vite + React SPA (src/, migrations/, test/, docs/)
│   ├── migrations/                     # SQLite schema migrations 0001–0004 (shared with the Node server)
│   ├── src/lib/repo/                   # Repository + StorageAdapters (the only data API)
│   ├── src/lib/ai/                     # Provider clients and local agent bridge
│   ├── src/lib/prompts/                # Prompt builders (course, lesson, tutor, practice, capstone)
│   ├── src/lib/i18n/                   # en.json, vi.json, language detection
│   ├── src/lib/runner/                 # Code runner (browser + local toolchain)
│   ├── src/workers/                    # js/python/sql Web Workers
│   ├── src/pages/ components/ data/    # Routes, UI, demo course data
│   └── docs/                           # DEPLOY.md, FOLLOW-UPS.md, SAAS-ROADMAP.md
├── test/                               # Root Vitest suite for CLI, web server and Studio bridge helpers
│   └── fixtures/                       # Course and roots fixtures (courses/, learning/)
├── scripts/                            # smoke-pack.mjs (npm pack smoke test)
├── docs/                               # Design plans and specs (plans/, superpowers/)
├── .claude-plugin/                     # marketplace.json (Claude plugin marketplace entry)
├── .github/workflows/                  # release-smoke.yml (CI)
├── .gitnexus/ .agents/ .claude/ .codex/ .cursor/ .gemini/ .opencode/   # Tooling/agent config dirs (not product code)
├── .publish-staging/                   # Staging area for publish flow
├── learning/                           # Runtime: active courses (git worktrees or folders) — NOT product code
├── courses/                            # Runtime: legacy courses — NOT product code
├── .course_archive/                    # Runtime: archived courses — NOT product code
├── .worktrees/                         # Git worktrees — NOT product code
├── plugin.json                         # Claude Code plugin manifest (agents, commands, hooks)
├── package.json                        # npm manifest, scripts, `files` allowlist
├── vitest.config.js                    # Root Vitest config
├── CLAUDE.md / AGENTS.md / GEMINI.md   # Agent instructions for this repo
└── README.md / CHANGELOG.md / TODOS.md / RELEASING.md / SYNC_GUIDE.md
```

## Directory Purposes

**`agents/`:**
- Purpose: Agent behavior specs loaded by the host agent.
- Contains: `professor.md` (main teaching agent, ~370 lines), `researcher.md`, `coach.md`, `spotter.md`, `navigator.md`.
- Key files: `agents/professor.md`.
- Edit here first; then run `bin/sync-shared.sh`.

**`commands/professor/`:**
- Purpose: One Markdown command per `professor:*` slash command.
- Contains: YAML frontmatter + behavior text. Includes `new-topic.md`, `next.md`, `done.md`, `review.md`,
  `hint.md`, `stuck.md`, `discuss.md`, `quiz.md`, `recall.md`, `schedule.md`, `syllabus.md`, `progress.md`,
  `capstone.md`, `capstone-review.md`, `note.md`, `export.md`, `archive.md`, `template-export.md`,
  `template-import.md`, `worktrees.md`, `switch.md`, `spotter.md`, `navigator.md`, `publish.md`,
  `skill-export.md`, `onboard.md`.
- Also contains a `.gitkeep`.

**`professor-skill/`:**
- Purpose: Full behavior specification (`SKILL.md`) for the professor agent; used by agent platforms that
  consume a single skill file.
- Contains: `SKILL.md` only.

**`shared/`:**
- Purpose: Platform-neutral canonical copies with tool-name placeholders (`AskUserQuestion`), read at install time.
- Contains: `shared/agents/`, `shared/commands/professor/`, `shared/hooks/pre-compact.js`, `shared/SKILL.md`.
- Note: `shared/SKILL.md` is a separate file from `professor-skill/SKILL.md`; the sync script does not copy it.
- Generated by: `bin/sync-shared.sh` (copies root `agents/`, `commands/professor/`, `hooks/`). Do not edit
  directly; `shared/SKILL.md` is maintained alongside `professor-skill/SKILL.md`.

**`hooks/`:**
- Purpose: Claude Code hook scripts.
- Contains: `pre-compact.js` (CommonJS; writes `session_state` frontmatter into the newest `COURSE.md`).
- Registered in: `plugin.json` under `hooks[]`.

**`templates/`:**
- Purpose: Per-platform install assets.
- Contains: `claude/plugin.json`, `claude/settings.json`, `gemini/GEMINI.md`, `gemini/settings.json`,
  `cursor/professor.mdc`, `cursor/settings.json`, `opencode/opencode.json`, `agent/settings.json`,
  `researcher/README.md`, `researcher/settings.json`.

**`bin/`:**
- Purpose: The `course-professor` / `professor` CLI (ES modules, `"type": "module"`).
- Contains:
  - `cli.js` — dispatcher (`switch (command)`): `web`, `init`/`setup`, `courses`, `search`, `install`, `update`,
    `installed`, `remove`, `publish`, `status`, `next`, `check`, `doctor`, `studio`, `review`, `import`, `list`, `help`.
  - `commands/` — `status.js`, `next.js`, `check.js`, `doctor.js`, `review.js`, `import.js`, `studio.js`.
  - `platforms/` — `_shared.js` (token substitution), `claude.js`, `gemini.js`, `opencode.js`, `cursor.js`.
  - Shared helpers: `course-reader.js` (COURSE/LECTURE/SCHEDULE parser), `registry-helpers.js` (registry fetch,
    install, validate), `static-server.js` (serves `studio/dist`), `studio-store.js` (Node adapter over
    `web/studio-db.js`), `node-version.js` (`requireStudioNode`).
  - `sync-shared.sh` — root → `shared/` sync script.

**`web/`:**
- Purpose: Local Express server that hosts the legacy UI, the Studio API and the agent bridge.
- Contains:
  - `server.js` — Express app on `PORT` (default 3000) / `HOST` (default 127.0.0.1). Mounts `/api/studio`,
    then legacy `/api/courses/*`, `/api/agents/*`, `/api/chat`, `/api/notify`; serves `client/dist` in production.
  - `studio-api.js` — `createStudioRouter()` (pairing token, origin allowlist, health, `/complete` agent
    bridge, `/db` table ops, `/run` runner, agent parsers). Default export is the lazy-initialized router.
  - `studio-db.js` — `createStudioDb()` over `node:sqlite`; DB at `${PROFESSOR_HOME:-~/.professor}/professor.db`.
  - `studio-runner.js` — `createRunnerRouter()`; workspace file writes and allowlisted command execution under
    `workspacesRoot`.
  - `lecture-archive.js` — `archiveLecture()` and section-number parsing used by `server.js`.
  - `.studio-token` — generated pairing token file (mode 0600). **Never commit or quote it.**
  - `package.json`, `package-lock.json` — server deps (`express`, `cors`).

**`web/client/`:**
- Purpose: Legacy React + Vite course UI (served by `web/server.js`).
- Contains: `src/App.jsx`, `src/main.jsx`, `src/components/` (ChatPanel, LecturePanel, ExerciseEditor, Header,
  SplitPane, MobileTabSwitcher, CommandPills, `ui/`), `src/hooks/` (`useSSE.js`, `useWebSocket.js`),
  `src/api/client.js`, `src/utils/markdown.js`, `src/lib/utils.js`, `index.html`, Tailwind/PostCSS configs.
- Build output: `web/client/dist/` (ignored by git, shipped via `files`).

**`studio/`:**
- Purpose: "Professor Studio", the newer SPA for courses, lessons, practice, capstone and settings.
- Contains: `package.json` (`vite`, `react` 19, `vitest`), `index.html`, `README.md`, `migrations/`, `src/`, `test/`, `docs/`.
- Build output: `studio/dist/` (relative base, hash routing).

**`studio/migrations/`:**
- Purpose: SQL migrations shared by Node (`web/studio-db.js`) and Cloudflare D1.
- Contains: `0001_init.sql`, `0002_external_ids.sql`, `0003_course_language.sql`, `0004_capstone.sql`.
- Rule: Add a new numbered file; never edit an applied migration.

**`studio/src/lib/repo/`:**
- Purpose: Repository and storage adapters.
- Contains: `index.js` (740 lines, business API), `schema.js` (`tableSpec`, `assertIndexedField`),
  `idb-adapter.js`, `memory-adapter.js`, `remote-adapter.js` (HTTP `/api/studio/db`), `blocked-adapter.js`,
  `select-adapter.js` (picks the adapter from settings).

**`studio/src/lib/ai/`:**
- Purpose: Provider abstraction and local bridge client.
- Contains: `index.js` (`PROVIDERS`, `getProvider()`, `testConnection()`), `anthropic.js`, `openai-compatible.js`,
  `ollama.js`, `bridge.js`, `catalog.js` (bridge agents), `config.js`, `provider-utils.js`, `sse.js`, `errors.js`,
  `fetch-local.js`, `status.js`, `useStream.js`.

**`studio/src/lib/prompts/`:**
- Purpose: Prompt text for each Studio generation surface: `base.js` (shared rules), `course.js`, `lesson.js`,
  `tutor.js`, `practice.js`, `capstone.js`.

**`studio/src/lib/runner/`:**
- Purpose: Run learner code. `index.js` (entry), `browser.js`, `local.js`, `languages.js`, `checks.js`,
  `skeleton.js`, `esm-cjs.js`, `strip-types.js`, `path.js`, `history.js`, `hash.js`, `current-code.js`.

**`studio/src/lib/i18n/`:**
- Purpose: UI strings. `en.json`, `vi.json`, `index.js` (`useT`), `detect.js`, `languages.js`.
- Demo content: `studio/src/data/demo-course.js` and `demo-course.vi.js`.

**`studio/src/components/`:**
- Subfolders: `capstone/`, `course/`, `data/` (storage choice, move dialog), `practice/` (flashcards, quiz, `card-store.js`),
  `settings/` (`ProviderForm.jsx`), `tutor/` (chat panel), `workspace/` (code editor, file tabs, output, history),
  `ui/` (Button, Card, Input, Markdown, Badge, Progress, Spinner, EmptyState, ErrorNotice), plus `Layout.jsx`,
  `Onboarding.jsx`.

**`studio/src/pages/`:**
- `Home.jsx`, `NewCourse.jsx`, `Course.jsx`, `Lesson.jsx`, `Capstone.jsx`, `Review.jsx`, `Settings.jsx`.

**`studio/src/lib/` (other):**
- `router.js` (hash router), `settings.js` (localStorage settings, `applyPairingFromUrl`), `srs.js` (spaced
  repetition), `course.js`, `course-export.js`, `capstone.js`, `chat-store.js`, `activity.js`, `ids.js`, `json.js`,
  `markdown.js`.

**`studio/src/workers/`:** `js.worker.js`, `python.worker.js`, `sql.worker.js` (browser execution).

**`test/`:**
- Purpose: Root Vitest suite (`vitest.config.js`), run with `npm test`.
- Contains: `cli*.test.js` (CLI commands, import, review, studio), `studio-api*.test.js`, `studio-runner.test.js`,
  `lecture-archive.test.js`, `node-version.test.js`.
- Fixtures: `test/fixtures/courses/*` (COURSE/LECTURE/SCHEDULE samples), `test/fixtures/roots/{courses,learning}/*`.

**`studio/test/`:**
- Purpose: Studio Vitest suite (`npm test` inside `studio/` → `vitest run`).
- Contains: `repo.test.js`, `adapter-contract.test.js`, `idb-upgrade.test.js`, `ai*.test.js`, `runner-*.test.js`,
  `prompts-*.test.js`, `i18n-*.test.js`, `capstone.test.js`, `card-store.test.js`, `course-export.test.js`, and
  `fixtures/agents/*.jsonl` (recorded agent CLI output).

**`scripts/`:** `smoke-pack.mjs` — packs the npm tarball and verifies its contents (`npm run smoke:pack`).

**`docs/`:** `plans/` and `superpowers/{plans,specs}/` — dated design documents. Not consumed by code.

**`.claude-plugin/`:** `marketplace.json` — marketplace listing for the plugin (version `1.2.0`).

**`resources/`:** `static-research.md` (reference material; not loaded by code).

## Key File Locations

**Entry Points:**
- `plugin.json`: Claude Code plugin manifest.
- `bin/cli.js`: npm bin entry (`course-professor`, `professor`).
- `web/server.js`: Express server (`npm start`).
- `studio/src/main.jsx`: Studio SPA bootstrap (imports `App.jsx`).
- `web/client/src/main.jsx`: Legacy UI bootstrap.
- `hooks/pre-compact.js`: PreCompact hook.

**Configuration:**
- `package.json`: npm scripts (`build`, `build:studio`, `start`, `test`, `smoke:pack`), `files` allowlist.
- `vitest.config.js`: root test config.
- `studio/package.json`, `studio/vite.config.js`: Studio build (`base: './'`, Vite 8).
- `web/client/vite.config.js`, `web/client/tailwind.config.js`, `web/client/components.json`: legacy UI build.
- `void.config.ts`: deployment config at repo root.
- `.npmignore`: excludes `test/`, `scripts/`, `.planning/`, `.worktrees/`, `web/.studio-token` from the package.
- `.gitignore`: ignores `learning/`, `courses/`, `.course_archive/`, `.worktrees/`, `dist/`, `web/client/dist`, and all
  agent tooling directories (`.claude/**`, `.agents/**`, …).

**Core Logic:**
- `agents/professor.md`, `professor-skill/SKILL.md`: Teaching behavior.
- `bin/course-reader.js`: Course file parser.
- `bin/commands/import.js`: CLI → Studio import (`planCourseImport`, `applyCourseImport`).
- `bin/commands/review.js`: Terminal flashcard review (SM-2 via repo).
- `web/studio-api.js`: Studio HTTP API and agent bridge.
- `web/studio-db.js`: SQLite layer.
- `studio/src/lib/repo/index.js`: Studio data API.
- `studio/src/lib/ai/index.js`: Provider selection.
- `studio/src/lib/runner/index.js`: Code runner entry.

**Testing:**
- `test/`: root suite for CLI and server helpers.
- `studio/test/`: Studio unit and contract tests.
- `vitest.config.js`: root Vitest configuration.

## Naming Conventions

**Files:**
- Plugin Markdown specs: lowercase kebab-case matching the command name: `commands/professor/capstone-review.md` → `professor:capstone-review`.
- Agents: lowercase single words: `agents/professor.md`.
- Root docs: UPPERCASE.md (`CLAUDE.md`, `AGENTS.md`, `TODOS.md`).
- Node CLI and server modules: kebab-case (`course-reader.js`, `registry-helpers.js`, `studio-api.js`, `studio-db.js`).
- Studio React components and pages: PascalCase `.jsx` (`TutorPanel.jsx`, `Review.jsx`).
- Studio library modules: kebab-case `.js` (`select-adapter.js`, `fetch-local.js`, `card-store.js`).
- Studio workers: `<lang>.worker.js`.
- Migrations: `NNNN_snake_case.sql` (`0004_capstone.sql`).
- Tests: `<area>.test.js`; CLI tests prefixed `cli-` (`cli-import.test.js`), Studio API tests prefixed `studio-api`.
- Hook: `hooks/pre-compact.js`.

**Directories:**
- Plugin dirs use plural nouns (`agents/`, `commands/`, `hooks/`, `templates/`); Studio subfolders are by feature
  (`practice/`, `workspace/`, `capstone/`) or by layer (`lib/repo`, `lib/ai`).
- Runtime course dirs are slugs: `learning/{slug}/`, `courses/{slug}/`, `.course_archive/{slug}/`.

**Commands:**
- Plugin command names: `professor:<kebab-name>`; the file is `commands/professor/<kebab-name>.md`.
- CLI subcommands: single lowercase words (`status`, `next`, `review`, `import`, `studio`).

## Where to Add New Code

**New Claude plugin command:**
1. Create `commands/professor/<name>.md` (frontmatter + behavior).
2. Register it in `plugin.json` under `commands[]` (`templates/claude/plugin.json` also lists the commands and must be kept in step).
3. Run `bin/sync-shared.sh` to copy it into `shared/commands/professor/<name>.md`.
4. Update the command table in `CLAUDE.md`.

**New agent:** `agents/<name>.md`, register in `plugin.json` `agents[]`, mirror into `shared/agents/`.

**New CLI subcommand:**
- Handler: `bin/commands/<name>.js` exporting `run(ctx)`.
- Dispatch: add a `case '<name>':` in the `switch` in `bin/cli.js`.
- Tests: `test/cli-<name>.test.js`.

**New platform installer:** `bin/platforms/<platform>.js` exporting `detect()` and `install(scope)`; add the
platform to `SUPPORTED_AGENTS` in `bin/cli.js` and, if it needs tool-name substitution, to `TOOL_SUBSTITUTIONS` in `bin/platforms/_shared.js`.

**New Express route for the legacy UI:** add to `web/server.js` next to the existing `/api/courses` handlers.

**New Studio API route:** add to `createStudioRouter()` in `web/studio-api.js` (inherits the token and origin
guards). Table operations go through `/api/studio/db`; do not add a new route for table CRUD.

**New Studio table or column:**
1. Add a numbered SQL file in `studio/migrations/` (e.g. `0005_<name>.sql`).
2. Update `studio/src/lib/repo/schema.js` (`tableSpec`) so the adapters and SQLite whitelist accept it.
3. Add repository functions in `studio/src/lib/repo/index.js`. Pages must call the repo, not adapters directly.
4. Cover with `studio/test/repo.test.js` and `studio/test/adapter-contract.test.js`.

**New Studio page:** `studio/src/pages/<Name>.jsx`, add a route pattern in `studio/src/lib/router.js`,
then wire it in `studio/src/App.jsx` (lazy-loaded like the existing pages).

**New Studio UI component:** `studio/src/components/<feature>/<Name>.jsx`; shared primitives in `studio/src/components/ui/`.

**New AI provider:** `studio/src/lib/ai/<provider>.js` implementing the existing provider interface, registered in
`PROVIDERS` in `studio/src/lib/ai/index.js`; catalog entries in `catalog.js`.

**New prompt:** `studio/src/lib/prompts/<surface>.js`; shared rules in `base.js`.

**New runner language:** `studio/src/lib/runner/languages.js` plus a worker in `studio/src/workers/` (browser)
or an allowlisted command in `web/studio-runner.js` (local).

**New UI strings:** add keys to both `studio/src/lib/i18n/en.json` and `vi.json` (`studio/test/i18n-keys.test.js` checks parity).

**Shared utilities:**
- CLI: `bin/registry-helpers.js` (network and install helpers) or `bin/course-reader.js` (course parsing).
- Studio: `studio/src/lib/ids.js`, `json.js`, `markdown.js`, `course.js`.

## Special Directories

**`learning/`:**
- Purpose: Primary runtime course storage (git worktrees for `programming`, plain folders otherwise).
- Generated: Yes, by the professor agent at runtime.
- Committed: No (`.gitignore`). Not product code; excluded from this map.

**`courses/`:**
- Purpose: Legacy course storage read as a fallback by all commands and `web/server.js`.
- Generated: Yes. Committed: No.

**`.course_archive/`:**
- Purpose: Archived courses (`SUMMARY.md` plus copied course files) from `professor:archive`.
- Generated: Yes. Committed: No.

**`.worktrees/`:**
- Purpose: Git worktrees for active programming courses.
- Generated: Yes. Committed: No.

**`web/client/dist/`, `studio/dist/`, `dist/`:**
- Purpose: Vite build output served in production (`studio/dist` by `bin/commands/studio.js` and `static-server.js`).
- Generated: Yes (`npm run build`, `npm run build:studio`). Committed: No.

**`node_modules/`, `web/node_modules/`, `studio/node_modules/`, `web/client/node_modules/`:**
- Generated: Yes. Committed: No.

**`web/.studio-token`:**
- Purpose: Pairing token for the local Studio API.
- Generated: Yes at server start (mode 0600). Committed: No. Never print or copy its contents.

**`.planning/`, `.planning-archive/`:**
- Purpose: GSD planning and codebase analysis documents.
- Excluded from the npm package and from `.npmignore`.

**Tool directories `.claude/`, `.agents/`, `.cursor/`, `.gemini/`, `.opencode/`, `.codex/`, `.gitnexus/`, `.publish-staging/`:**
- Purpose: Local agent/tooling configuration and staging. Ignored by `.gitignore` (except as noted); not product code.

**`.env`:** Present at repo root. Contains environment configuration; contents intentionally not documented here.

---

*Structure analysis: 2026-10-17*
