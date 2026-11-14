# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always respond in English as default, respond in the same language as the user's message.

## What This Project Is

**Ronin SkillForce** (npm `ronin-skillforce`, CLI `skillforce`; formerly `course-professor`) — a
Socratic learning coach that teaches by asking questions instead of giving answers. It ships as:

1. **An agent plugin** — Markdown agents and `professor:*` slash commands for Claude Code, plus
   generated installs for Gemini CLI, OpenCode and Cursor. No build step.
2. **The `skillforce` CLI** (`bin/cli.js`) — platform setup, course create/save, dev fast-path
   (`status`/`next`/`check`/`doctor`), terminal flashcards, import into Studio, registry.
3. **Studio** (`studio/`) — a local-first Vite + React SPA (lessons, quiz, flashcards, tutor,
   exercises, capstone) served by `skillforce studio` together with a local bridge server.

`course-professor` and `professor` remain bin aliases. Slash commands are still `professor:*` and
data still lives in `~/.professor/` (renaming those is RON-316 / RON-317).

## Development Commands

```bash
# Tests — one Vitest run with two projects: root (test/) and studio (studio/test/)
npm test
npx vitest run test/cli-create.test.js                 # one root test file
npx vitest run --project studio studio/test/srs.test.js # one Studio test file
npx vitest run -t "rolls back"                         # by test name
npm run test:security                                  # test/security only
npm run test:drift                                     # shared/ + manifest parity
npm run test:e2e                                       # Playwright (e2e/), needs a Studio build
npm run smoke:pack                                     # npm pack → install → run every bin + Studio

# Studio
cd studio && npm run dev                               # Vite dev server :5180, demo course, no AI needed
npm run build:studio                                   # build studio/dist (shipped in the package)
node bin/cli.js studio --no-open                       # bridge + built Studio + pairing URL

# CLI (no build step) — every command lives in bin/commands/<name>.js
node bin/cli.js --help
node bin/cli.js status | next [slug] | check [slug] | doctor
node bin/cli.js create <slug> --kind K                 # programming = verified worktree, rollback on failure
node bin/cli.js save <slug> [-m msg]                   # commit a course worktree on learning/<slug>
node bin/cli.js context [slug] --json                  # explicit course context handed to Coach
node bin/cli.js trail <slug> --stdin                   # append a Coach round to LEARNING-LOG.md (JSON on stdin)

# After editing agents/, commands/professor/, hooks/pre-compact.js or professor-skill/SKILL.md
node scripts/sync-shared.mjs                           # regenerate shared/ (CI fails on drift)
node scripts/sync-shared.mjs --check
```

Node floors: the CLI runs on Node 18+; Studio, `review` and `import` need **Node 22.5+**
(`node:sqlite`), checked at the point of use by `bin/node-version.js`.

## Architecture

### Plugin: canonical Markdown → generated `shared/`

- Canonical sources: `agents/*.md`, `commands/professor/*.md`, `hooks/pre-compact.js`,
  `professor-skill/SKILL.md` (behaviour spec used by non-Claude platforms). **Never edit `shared/`
  by hand** — `scripts/sync-shared.mjs` copies the canonical bytes there.
- `plugin.json` registers agents/commands/hooks for Claude Code; a new command must be added there.
- At install time `bin/platforms/_shared.js#substituteTokens()` swaps the `AskUserQuestion`
  placeholder per platform (Gemini `ask_user`, OpenCode `question`, Cursor inline text);
  `bin/platforms/<platform>.js` handle detection and file placement.
- Markdown commands must call deterministic CLI steps instead of improvising file/git operations:
  `npx ronin-skillforce create|save|context|trail`. Pass learner-written text to `trail` as JSON in a
  quoted heredoc (`--stdin <<'TRAIL_EOF'`), never inside shell flags.
- Agents: `professor` (main, has Bash), `coach` (review/done/stuck — reads only under the `dir` it is
  given), `spotter`, `navigator`, `researcher`.

### Course storage

Courses live in `learning/{slug}/` (primary) or `courses/{slug}/` (legacy); every reader checks
`learning/` first. `COURSE.md` records a **Kind** (`programming | quantitative | conceptual |
skill`; missing → `programming`). `programming` courses are git worktrees on branch
`learning/{slug}` (created by `bin/commands/create.js`, `learning/` added to `.git/info/exclude`);
other kinds are plain folders. `bin/course-reader.js` parses COURSE.md / LECTURE.md /
LEARNING-LOG.md / SCHEDULE.md for every CLI command.

Per course: `COURSE.md` (syllabus + progress, source of truth), `LECTURE.md` (active section;
archived to `lectures/NN-<slug>.md` before being replaced), `LEARNING-LOG.md` (Coach trail,
attempts, section entries), `CAPSTONE.md` (immutable), `NOTES.md`, `exercises/`.

### Studio and the local server

- `studio/src/lib/repo/` is the single data layer. `select-adapter.js` picks one adapter — IndexedDB
  (browser) or `remote-adapter.js` → SQLite at `~/.professor/professor.db` through the local server —
  and Studio writes only to the store the learner chose.
- The CLI shares that same repo code: `bin/studio-store.js` installs a SQLite adapter so
  `skillforce review` / `import` grade cards and write rows exactly like Studio.
- `web/server.js` serves only the Studio API by default (`web/studio-api/`: health, db, bridge to
  local agent CLIs, guards behind a pairing token). The old React UI in `web/client/` runs only with
  `--legacy` / `PROFESSOR_LEGACY=1` and is slated for removal.
- SQL migrations are in `studio/migrations/NNNN_*.sql` — add a new file, never edit an applied one.
- AI calls go straight from the browser (`studio/src/lib/ai/`: Anthropic, OpenAI-compatible, Ollama)
  or through the bridge to a local agent; prompts live in `studio/src/lib/prompts/`. Interactive
  exercises are declarative zod specs in `studio/src/lib/exercises/`; code runs in
  `studio/src/lib/runner/` (browser or local runner).
- The app version shown in Studio is the **root** `package.json` version injected by
  `studio/vite.config.js`; `studio/package.json` is private and unversioned.

### Versions and releases

`package.json`, `plugin.json`, `templates/claude/plugin.json` and `.claude-plugin/marketplace.json`
must carry the same version (`test/shared-drift.test.js`). Betas publish from `develop` with
`npm publish --tag next`; see `RELEASING.md`. `prepublishOnly` builds both web clients.

## Conventions

- `bin/` and `bin/platforms/` are ES modules; `hooks/pre-compact.js` is CommonJS. 2-space indent,
  semicolons, 100-char lines, `path.join()` for paths.
- Shell out with `execFileSync('git', [...])`, never a composed command string.
- New Markdown behaviour that the CLI must honour gets a contract test that reads the Markdown
  (see the `contract` blocks in `test/cli-create.test.js`, `test/cli-trail.test.js`).

## Core Behavior Rules (professor agent and all commands)

1. **Never write working code** for the learner and never complete exercises for them.
2. **Capstone phase**: no hints, no `professor:stuck`, no code nudges — `professor:discuss` only.
3. **Read `COURSE.md` first** at conversation start (`learning/` before `courses/`) and **update it
   immediately** when a section's status changes.
4. **LECTURE.md is archived, not lost**; **CAPSTONE.md is immutable**.
5. **Never fabricate sources** — lectures research 3–6 sources first, cite key claims `[n]`, mark
   unsourceable claims `⚠️ unverified`, and list only URLs actually fetched in `## 🔗 Sources`.

## Work Tracking: Linear + OpenSpec

Tickets live in **Linear** — team `RON`, project
[Skill-Forces](https://linear.app/ronnie-workspace/project/skill-forces-3e1c22eb08c9). Specs and
change proposals live in **OpenSpec** (`openspec/`).

1. Pick (or create) a Linear issue; move it to **In Progress**.
2. One OpenSpec change per issue, named `ron-<number>-<slug>`: `/opsx:propose` → `/opsx:apply`.
3. Branch with the issue's Linear branch name and put `RON-<number>` in commits / the PR title.
4. `/opsx:verify` + `npm test`, open the PR against `develop`, move the issue to **In Review**.
5. After merge: `/opsx:archive`, mark the issue **Done**.

Delegated work runs through the dev-orchestrator skill (`.claude/dev-orchestrator.env`:
`TRACKER=linear`, `SPEC_BY=agent`, `MERGE_BY=coordinator`, max 4 agents). With `SPEC_BY=agent` a
hook blocks this session from running OpenSpec; workers dispatched with
`.planning/workers/dispatch.sh <ISSUE-ID> <gitBranchName> <change-name>` run propose/apply/archive.
Bugs found mid-change get a new Linear issue. `.planning/`, `.planning-archive/` and `TODOS.md`
are **legacy history (read-only)**.

## Optional MCP export

`professor:export` needs a Notion (`@modelcontextprotocol/server-notion`, `NOTION_API_TOKEN`) or
Obsidian (`mcp-obsidian`) MCP server in `.mcp.json`; the core learning flow works without either.
