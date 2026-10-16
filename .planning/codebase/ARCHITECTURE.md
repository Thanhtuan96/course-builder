---
last_mapped_commit: 23bc7fcb6e5197d01731ffb36dc0f2d3628cef67
last_mapped_at: 2026-10-17
---
# Architecture

**Analysis Date:** 2026-10-17

## Pattern Overview

**Overall:** Multi-surface monorepo built around a shared, file-based course model. Three
delivery surfaces (Claude Code/agent plugin, `course-professor` npx CLI, local web apps) read and
write the same course artifacts and the same SQLite database. Behavior is specified in Markdown
(agents and commands) and executed by external AI agent CLIs; only the CLI, the web server and
Studio have compiled/runtime JavaScript.

**Key Characteristics:**
- **Markdown-as-program (plugin surface):** `agents/*.md`, `commands/professor/*.md` and
  `professor-skill/SKILL.md` are prompt specs loaded by Claude Code (or other agents). There is no
  build step for them.
- **Canonical + generated copies:** `shared/` holds platform-neutral copies of `agents/`,
  `commands/professor/` and `hooks/` with `AskUserQuestion` as a tool-name placeholder. Root files are
  the editing source; `bin/sync-shared.sh` copies them into `shared/`.
- **File-based course state:** Each course is a directory (`learning/{slug}/`, legacy `courses/{slug}/`)
  whose `COURSE.md`, `LECTURE.md`, `LEARNING-LOG.md`, `SCHEDULE.md` etc. are the source of truth for
  the agent. The CLI parses these with `bin/course-reader.js`.
- **Shared repository layer (Studio):** All Studio business logic lives in one module,
  `studio/src/lib/repo/index.js`. Storage is pluggable through a table-level `StorageAdapter`
  (IndexedDB in the browser, in-memory for tests, remote HTTP to the local server, or a Node SQLite
  adapter). The same repo code runs in the browser and in the CLI (`bin/studio-store.js`).
- **Local bridge pattern:** The browser never holds a provider API key for the bridge mode. Studio
  calls `web/studio-api.js` on `localhost:3000`, which spawns the learner's installed agent CLI
  (`claude`, `opencode`, `cursor-agent`, `gemini`, `antigravity`, `ollama`) and streams the result over SSE.
- **Pairing-token auth for local API:** `web/studio-api.js` generates a token, writes it to
  `web/.studio-token` (mode 0600) and requires `X-Studio-Token` on Studio routes; CORS is limited to
  a configured origin allowlist (default `localhost:5180`).

## Surfaces and How They Connect

```
                     ┌──────────────────────────────────────────────┐
                     │  Course data (file-based)                    │
                     │  learning/{slug}/ (git worktree or folder)   │
                     │  courses/{slug}/ (legacy)                    │
                     │  .course_archive/{slug}/                     │
                     └───────▲──────────────▲──────────────▲────────┘
                             │ read/write   │ read         │ read/write (courses/ via web/server.js)
┌────────────────────────┐   │              │              │
│ Claude Code / Gemini / │───┘              │              │
│ OpenCode / Cursor      │  agents/ +       │              │
│ (Markdown specs)       │  commands/ +     │              │
│ professor-skill/       │  hooks/          │              │
└────────────────────────┘                  │              │
                                            │              │
┌────────────────────────┐  bin/cli.js      │              │
│ npx course-professor   │──────────────────┘              │
│ setup/install/status/  │  bin/course-reader.js           │
│ next/check/doctor/     │  bin/commands/*.js              │
│ review/import/studio   │                                 │
└──────┬─────────────────┘                                 │
       │ review/import: bin/studio-store.js                │
       │ (same SQLite file, same repo code)                │
       ▼                                                   │
┌──────────────────────────────────────────────┐           │
│ SQLite: ${PROFESSOR_HOME:-~/.professor}/     │           │
│         professor.db (node:sqlite)          │◀──────────┤
│ migrations: studio/migrations/*.sql          │  web/studio-db.js
└──────▲───────────────────────────────────────┘           │
       │ POST /api/studio/db (X-Studio-Token)             │
┌──────┴──────────────────────────────┐  ┌────────────────┴─────────────┐
│ web/server.js (Express :3000)       │  │ web/client (legacy React UI) │
│  └ web/studio-api.js (/api/studio)  │  │ served from web/client/dist  │
│     ├ studio-db.js  (DB routes)     │  └──────────────────────────────┘
│     ├ studio-runner.js (/run)       │
│     └ /complete (agent CLI bridge)  │
└──────▲──────────────────────────────┘
       │ HTTP + SSE
┌──────┴──────────────────────────────┐
│ studio/ (Vite + React SPA,          │
│  "Professor Studio", served on :5180│
│  by bin/static-server.js or Vite)   │
│  lib/repo, lib/ai, lib/runner, ...  │
└─────────────────────────────────────┘
```

Connection points (verified in source):

- **Plugin ↔ files:** Agents and commands read/write `learning/{slug}/` directly (per `CLAUDE.md`
  rules). `hooks/pre-compact.js` (CommonJS) writes `session_state` frontmatter into the most recent
  `COURSE.md` when context is near its limit.
- **CLI ↔ files:** `bin/course-reader.js` (`findCourses`, `readCourse`) parses `COURSE.md`,
  `LECTURE.md`, `SCHEDULE.md`, `LEARNING-LOG.md`. Used by `status`, `next`, `check`, `review`, `import`.
- **CLI ↔ Studio DB:** `bin/studio-store.js` `installStudioStore()` calls `useAdapter()` from
  `studio/src/lib/repo/index.js` with a Node adapter built on `web/studio-db.js`. `review` grades cards
  via `gradeCard()`; `import` writes courses, lessons, cards, notes and capstone data with stable
  `external_id` values (`cli:<slug>`, …) so re-imports are idempotent.
- **CLI `studio` command:** `bin/commands/studio.js` ensures `web/` and `studio/` dependencies,
  builds `studio/dist` if stale, starts `web/server.js` (on `--api-port`, default 3000), serves
  `studio/dist` via `bin/static-server.js` (on `--port`, default 5180), waits for
  `/api/studio/health`, then opens `http://localhost:5180/#/settings?bridge=…&token=…`.
- **Studio ↔ server:** `studio/src/lib/repo/remote-adapter.js` posts table operations to
  `/api/studio/db`; `studio/src/lib/ai/bridge.js` posts to `/api/studio/complete` (SSE) and reads
  `/api/studio/health` and `/api/studio/agents/:agent/models`; `studio/src/lib/runner/local.js` posts
  to `/api/studio/run` (URL built by `runnerBase()`) for toolchains not available in the browser.
- **Studio storage selection:** `studio/src/lib/repo/select-adapter.js` chooses exactly one backend
  from `settings.storage` (`browser` = IndexedDB, `sqlite` = remote adapter). If SQLite is chosen and
  the server is down, `studio/src/lib/repo/blocked-adapter.js` rejects every call instead of falling
  back to IndexedDB.
- **Legacy web UI ↔ server:** `web/client/src/api/client.js` calls `/api/courses/...` and `/api/chat`
  in `web/server.js`. `/api/chat` spawns the `claude`, `cursor-agent` or `opencode` binaries directly
  (`web/server.js` lines ~414, ~764, ~854) and streams output as SSE.

## Layers

**Agent specification layer (Markdown):**
- Purpose: Define the Socratic teaching behavior, command contracts and course lifecycle.
- Location: `professor-skill/SKILL.md` (source-of-truth behavior spec), `agents/`, `commands/professor/`
- Contains: YAML frontmatter + prompt text for 5 agents and 26 commands.
- Depends on: Host agent runtime (Claude Code, Gemini CLI, OpenCode, Cursor) and the file layout of courses.
- Used by: Host agents via `plugin.json` discovery (or platform install in `bin/platforms/`).

**Platform-neutral canonical layer:**
- Purpose: Ship the same behavior to four platforms.
- Location: `shared/` (`shared/agents/`, `shared/commands/professor/`, `shared/hooks/`, `shared/SKILL.md`)
- Contains: Copies of the root files with tool-name placeholders.
- Depends on: `bin/platforms/_shared.js` `substituteTokens()` at install time.
- Used by: `bin/platforms/{claude,gemini,opencode,cursor}.js` and `templates/`.

**Hook layer:**
- Purpose: Preserve course state before context compression.
- Location: `hooks/pre-compact.js` (CommonJS), mirrored at `shared/hooks/pre-compact.js`.
- Depends on: `learning/` then `courses/` directories.
- Used by: Claude Code `PreCompact` event (declared in `plugin.json`).

**CLI layer (ES modules):**
- Purpose: Install/manage the plugin, read course progress, drive flashcard review and import.
- Location: `bin/cli.js` (dispatcher, install flows), `bin/commands/*.js`, `bin/course-reader.js`,
  `bin/registry-helpers.js`, `bin/platforms/*.js`, `bin/static-server.js`, `bin/studio-store.js`,
  `bin/node-version.js`.
- Contains: Subcommand handlers (`web`, `init`, `setup`, `courses`, `search`, `install`, `update`,
  `installed`, `remove`, `publish`, `status`, `next`, `check`, `doctor`, `studio`, `review`, `import`,
  `list`, `help`).
- Depends on: `chalk`, `inquirer`, `ora`, `express`, `cors` (root `package.json`); `studio/src/lib/*`
  via relative imports; `web/studio-db.js`.
- Used by: `npx course-professor` / `professor` binaries.

**Web server layer (Express, CommonJS-free ES modules):**
- Purpose: Serve the legacy course UI, the Studio API and the agent bridge on one port.
- Location: `web/server.js` (entry, legacy `/api/courses`, `/api/chat`), `web/studio-api.js` (Studio
  router), `web/studio-db.js` (SQLite), `web/studio-runner.js` (workspace execution),
  `web/lecture-archive.js` (lecture archiving helper, imported by `web/server.js`).
- Depends on: `node:sqlite` (`DatabaseSync`), spawned agent CLIs, `studio/migrations/`.
- Used by: `npm start` (`cd web && node server.js`), `npx course-professor web`, Studio UI, CLI `studio`.

**Studio domain layer (browser + Node-shared):**
- Purpose: All Studio rules: ids, ownership, timestamps, tombstones, SRS scheduling, activity log,
  capstone submissions, workspace files.
- Location: `studio/src/lib/repo/` (`index.js` is the only data API pages use), `studio/src/lib/srs.js`
  (SM-2 style scheduling), `studio/src/lib/course.js`, `studio/src/lib/capstone.js`,
  `studio/src/lib/course-export.js`, `studio/src/lib/chat-store.js`, `studio/src/components/practice/card-store.js`
  (in `components/practice/`), `studio/src/lib/activity.js`, `studio/src/lib/ids.js`.
- Depends on: Adapter chosen at startup (`idb-adapter.js`, `memory-adapter.js`, `remote-adapter.js`,
  `blocked-adapter.js`) and `studio/src/lib/repo/schema.js` `tableSpec()` / `assertIndexedField()`.
- Used by: Studio pages (`studio/src/pages/*.jsx`), components, and `bin/commands/review.js` /
  `bin/commands/import.js` (via `studio-store.js`).

**Studio AI layer:**
- Purpose: Talk to a model provider (BYOK HTTP providers or the local agent bridge) and build prompts.
- Location: `studio/src/lib/ai/` (`index.js` `getProvider()`, `anthropic.js`, `openai-compatible.js`,
  `ollama.js`, `bridge.js`, `catalog.js`, `config.js`, `sse.js`, `useStream.js`, `status.js`),
  `studio/src/lib/prompts/` (`base.js`, `course.js`, `lesson.js`, `tutor.js`, `practice.js`, `capstone.js`).
- Depends on: `provider-utils.js` `createGenerateJson`, `fetch-local.js`, `errors.js`.
- Used by: Studio course generation, lesson content, tutor chat, practice and capstone review.

**Studio runner layer:**
- Purpose: Execute learner code.
- Location: `studio/src/lib/runner/` (`index.js` entry `run({language, files, entry, tests, signal, onOutput})`,
  `browser.js` for JS/TS/Python/SQL/HTML/CSS, `local.js` for server-side toolchains, `checks.js`,
  `history.js`), `studio/src/workers/{js,python,sql}.worker.js`.
- Depends on: Web Workers in the browser; `web/studio-runner.js` (`/api/studio/run`) for local execution.
- Used by: `studio/src/components/workspace/*` and `studio/src/components/practice/*`.

**Studio UI layer:**
- Purpose: Pages and components.
- Location: `studio/src/App.jsx` (shell, lazy route pages, onboarding, storage move dialog),
  `studio/src/lib/router.js` (hash router), `studio/src/pages/`, `studio/src/components/`.
- Depends on: Studio domain and AI layers, `lib/i18n/` (`en.json`, `vi.json`, `detect.js`).
- Used by: `studio/src/main.jsx`.

## Data Flow

**Course lifecycle (plugin):**

1. `professor:new-topic` creates `learning/{slug}/` (worktree for `programming`, plain folder otherwise)
   and `COURSE.md`.
2. `professor:next` archives the previous `LECTURE.md` into `lectures/NN-<slug>.md`, writes a new
   `LECTURE.md`, creates `exercises/` and sets the section to 🔄 in `COURSE.md`.
3. `professor:done` / `review` / `hint` update `COURSE.md` and `LEARNING-LOG.md`.
4. `bin/cli.js status|next|check` read the same files through `bin/course-reader.js` for terminal use.
5. `professor:archive` writes `SUMMARY.md`, copies the course to `.course_archive/{slug}/`.

**Import into Studio (CLI):**

1. `course-professor import [slug|--all] [--dry-run]` → `bin/commands/import.js`
2. `findCourses`/`readCourse` read `learning/` then `courses/` (`bin/course-reader.js`)
3. `planCourseImport()` builds a plan; `applyCourseImport(plan, store)` writes through
   `studio/src/lib/repo/index.js` using the store from `bin/studio-store.js`
4. Rows land in `${PROFESSOR_HOME:-~/.professor}/professor.db`; Studio sees them via `/api/studio/db`.

**Studio lesson generation (bridge mode):**

1. Studio page calls `studio/src/lib/ai/index.js` `getProvider(settings)` → `bridge.js`
2. `POST /api/studio/complete` (header `X-Studio-Token`) → `web/studio-api.js` `clampMessages()`,
   `flattenConversation()`, then `runJsonCli()` spawns the chosen agent CLI in a temp cwd
3. Agent stdout is parsed (`extractClaudeText`, `extractOpencodeText`, …) and re-emitted as SSE
   `data: {"text":"…"}` chunks, ending with `data: [DONE]`
4. Result is saved via `addLessonVersion()` in the repo.

**Studio flashcard review (CLI or browser):**

1. `listDueCards()` → `gradeCard(cardId, grade)` in `studio/src/lib/repo/index.js`, scheduling via
   `studio/src/lib/srs.js` `review()`; `logActivity()` records the event.
2. Identical code path for `course-professor review` (`bin/commands/review.js`) and the Review page.

**State Management:**
- Plugin: state lives in course files only (no in-memory state between agent turns beyond
  `session_state` written by the PreCompact hook).
- Studio: React component state + `useSettings()` backed by `localStorage` (`studio/src/lib/settings.js`);
  data-change events from `repo/index.js` via `onChange()` (EventTarget) drive re-renders.
- Server: stateless per request except the DB handle and the pairing token opened at startup.

## Key Abstractions

**StorageAdapter (table-level contract):**
- Purpose: Swap storage medium without changing business rules.
- Examples: `studio/src/lib/repo/idb-adapter.js`, `memory-adapter.js`, `remote-adapter.js`,
  `blocked-adapter.js`, `select-adapter.js` (chooses), `bin/studio-store.js` (Node CLI adapter),
  `web/studio-db.js` (`createStudioDb()` SQLite implementation).
- Pattern: Dumb CRUD by table name (`get`, `put`, `putMany`, `list`, `softDelete`), with the
  repository owning ids, `owner_id`, `created_at`/`updated_at`/`deleted_at`.

**Repository (`studio/src/lib/repo/index.js`, ~740 lines):**
- Purpose: Single data API for pages and CLI.
- Examples: `createCourse`, `addLessonVersion`, `addCards`, `listDueCards`, `gradeCard`,
  `createCapstoneSubmission`, `saveRunResult`, `exportAll`/`importAll`.
- Pattern: Functions over `useAdapter(next)`-selected adapter; emits change events on writes.

**Schema registry (`studio/src/lib/repo/schema.js`):**
- Purpose: Table and indexed-field definitions shared by adapters and the SQLite whitelist.
- Pattern: `tableSpec(table)` and `assertIndexedField()` guard all identifiers.

**Migrations (`studio/migrations/`):**
- `0001_init.sql`, `0002_external_ids.sql` (adds CLI `external_id` for idempotent import),
  `0003_course_language.sql`, `0004_capstone.sql`. Applied in filename order by `web/studio-db.js`
  `runMigrations()` and tracked in a `d1_migrations` table so the same files run on Cloudflare D1.

**Agent runners (`web/studio-api.js`):**
- Purpose: One spawn function per CLI (`spawnClaude`, `spawnCursor`, `spawnOpencode`,
  `spawnGemini`, `spawnAntigravity`, `runOllama`) registered in `defaultAgentRunners()`.
- Pattern: Shared `runJsonCli(ctx, spec)` handles streams, timeouts and temp cwd; agent-specific
  output parsers are exported for tests (`test/studio-api-agents.test.js`).

**Platform installers (`bin/platforms/`):**
- Purpose: Place files for each host.
- Examples: `bin/platforms/claude.js` (`~/.claude/plugins/professor/` or local), `gemini.js`
  (`~/.gemini/GEMINI.md`), `opencode.js` (`~/.config/opencode/`), `cursor.js` (`~/.cursor/rules/professor.mdc`).
- Pattern: `detect()` + `install(scope)`; shared token substitution in `_shared.js`
  (`TOOL_SUBSTITUTIONS`, `substituteTokens(content, platform)`).

**Course reader (`bin/course-reader.js`, ~610 lines):**
- Purpose: Parse course Markdown into structured objects for the CLI and import.
- Examples: `findCourses()`, `readCourse()`, `parseSchedule()`, lecture heading parsing.

## Entry Points

**Claude Code plugin manifest:**
- Location: `plugin.json` (version `1.2.0`); mirrored by `.claude-plugin/marketplace.json` and `templates/claude/plugin.json`.
- Triggers: Plugin discovery by Claude Code.
- Responsibilities: Declares 5 agents, 26 commands (`commands/professor/*.md`) and the `PreCompact` hook.

**npx / global CLI:**
- Location: `bin/cli.js` (`package.json` `bin` → `course-professor`, `professor`).
- Triggers: `course-professor <command>`.
- Responsibilities: Setup, registry (`search`, `install`, `publish`), course status, Studio launch, review, import.

**Web server:**
- Location: `web/server.js` (`npm start` → `cd web && node server.js`, port 3000, host 127.0.0.1).
- Triggers: `npm start`, `course-professor web`, or spawned by `course-professor studio`.
- Responsibilities: Mounts `/api/studio` (via `studioRouter`) before CORS/JSON middleware, serves
  legacy `/api/courses` and `/api/chat`, and serves `web/client/dist` in production.

**Studio SPA:**
- Location: `studio/src/main.jsx` → `studio/src/App.jsx`; built to `studio/dist/` with relative base
  (`base: './'`) and hash routing.
- Triggers: Browser at `http://localhost:5180/` (CLI `studio`) or any static host.
- Responsibilities: Routes `#/`, `#/new`, `#/course/:id`, `#/course/:id/lesson/:lessonId`,
  `#/course/:id/capstone`, `#/review`, `#/settings` (see `studio/src/lib/router.js`).

**PreCompact hook:**
- Location: `hooks/pre-compact.js`.
- Triggers: Claude Code `PreCompact` event when token usage exceeds 80% of the 200k limit.

**Test entry:**
- Location: `vitest.config.js` (root, runs `test/*.test.js`); `studio/test/*.test.js` runs under
  `studio`'s own Vitest (`npm test` → `vitest run`).

## Error Handling

**Strategy:** Typed errors at layer boundaries, with HTTP-level mapping in the server and actionable
hints in the UI.

**Patterns:**
- `web/studio-db.js` throws `StudioDbError` with a code (e.g. `migration_failed`); `studio-api.js`
  maps it to `{ ok: false, error, code }` JSON.
- `studio/src/lib/ai/errors.js` `ProviderError`; `fetch-local.js` `classifyNetworkError()` and
  `mapHttpError()` turn fetch failures into user-facing messages; `bridge.js` appends a run hint
  ("Run `npx course-professor web` …").
- `studio/src/lib/repo/blocked-adapter.js` rejects all operations with `StorageUnavailableError` when SQLite
  is selected but unreachable.
- `web/server.js` `/api/studio` returns 503 when the Studio router fails to initialize.
- `web/studio-api.js` `createStudioRouter` rejects requests lacking a valid `X-Studio-Token` (`tokenMatches`
  uses `timingSafeEqual`) and non-loopback origins (`isLoopback`).

## Cross-Cutting Concerns

**Logging:** `console.log` in `web/server.js`; `log` callbacks injected into `createStudioDb`,
`installStudioStore` and `createStudioRouter` paths. CLI uses `chalk` via `style()` in `registry-helpers.js`.

**Validation:** Slug and relative-path checks in `web/studio-runner.js` (`isSafeSlug`, `isSafeRelPath`) and `studio/src/lib/runner/path.js`
and `web/studio-runner.js`; identifier whitelist in `web/studio-db.js`; `clampMessages()` and `MAX_CHARS`
in `web/studio-api.js`; JSON body limits (`25mb` on Studio router, `50mb` on legacy server).

**Authentication:** Local-only pairing token (`web/.studio-token`, mode 0600) plus origin allowlist
(`DEFAULT_ORIGINS = http://localhost:5180,http://127.0.0.1:5180`). No user accounts. Provider API keys
are BYOK in the browser (`studio/src/lib/settings.js`) and are never sent to the local server in bridge mode.

**Code execution safety:** `studio/src/lib/runner/` and `web/studio-runner.js` run commands from a fixed
allowlist via `spawn(..., { shell: false })`, with 20 s timeout and 200 KB output cap; the agent CLIs run
in a temp cwd.

**Packaging:** Root `package.json` `files` allowlist ships `bin/`, `templates/`, `shared/`, `plugin.json`,
`web/server.js` + Studio API modules, `web/dist/`, `studio/dist/`, `studio/migrations/`, `studio/src/lib/`
(`.npmignore` excludes `test/`, `scripts/`, `.planning/`, `.worktrees/`).

## Known Architectural Notes

- Two web UIs coexist: legacy `web/client/` (served by `web/server.js`, uses `/api/courses`) and the newer
  `studio/` SPA (uses `/api/studio`). The package `files` list ships both builds.
- `shared/` is a generated mirror; edits must be made in the root `agents/`, `commands/`, `hooks/` first.
- Version fields disagree: `package.json` is `1.6.0-beta.1`, `plugin.json` and `marketplace.json` are `1.2.0`.
- `plugin.json` declares 26 commands (including `professor:onboard`), while `CLAUDE.md` lists 25.
- `web/server.js` `/api/notify` is a placeholder (no WebSocket broadcast). `web/client/src/hooks/useWebSocket.js`
  exists but the server side is not implemented.

---

*Architecture analysis: 2026-10-17*
