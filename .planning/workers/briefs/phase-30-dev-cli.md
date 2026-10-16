# Task brief: Phase 30 — Dev CLI Fast-path

You implement one phase of milestone v3.0 in the Professor plugin's npx CLI (`bin/`). Own git worktree, branched from
`feat/studio-local-first` (contains Phases 22, 27, 28). Phases 23–26 and 29 run in parallel and touch `studio/` and `web/`
— you must NOT touch `studio/` or `web/`. Small conventional commits. Do NOT push.

Read first: `CLAUDE.md` (JS conventions: ES modules in bin/, 2-space, semicolons, path.join, fileURLToPath),
`bin/cli.js` (switch-based entry; `style()` helper; chalk/ora/inquirer available), `bin/registry-helpers.js`,
`test/cli.test.js`, `professor-skill/SKILL.md` (COURSE.md format incl. `**Kind**`, LECTURE.md format, exercise files
by kind), `commands/professor/next.md`, `done.md`, `recall.md`/`schedule.md` (SCHEDULE.md format),
and /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/REQUIREMENTS.md (CLI-01..04).

Real sample courses to test against (read-only, do not modify):
`/Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/learning/nextjs/` (table-format COURSE.md) — copy what
you need into test fixtures under `test/fixtures/courses/`.

## Requirements
CLI-01 status, CLI-02 next, CLI-03 check, CLI-04 doctor. (CLI-05..07 `studio`/`review`/`import` are Phase 31 — do not
implement, but design `course-reader.js` so they can reuse it.)

## Files you own
NEW `bin/course-reader.js`, NEW `bin/commands/status.js`, `next.js`, `check.js`, `doctor.js`, the 4 `case` blocks +
help/EXAMPLES text in `bin/cli.js` (one `case` per command delegating to the module — keep cli.js thin),
NEW `test/cli-course-reader.test.js`, `test/cli-commands.test.js`, `test/fixtures/**`, README.md (CLI section only),
CLAUDE.md (Development Commands section only).

## Build
1. **course-reader.js** (pure, unit-tested): `findCourses(cwd)` → scans `learning/*/` then legacy `courses/*/` (also
   `--dir` override); `readCourse(dir)` → `{ slug, title, level, kind (missing → 'programming'), sections:[{n, title,
   status: todo|active|done, completedAt}], activeExercise, lastActive, capstoneStatus, lectures:[file names in
   lectures/], log: parsed LEARNING-LOG.md entries (date, section, verdict), cards: parsed SCHEDULE.md (front, due) }`.
   Must parse ALL COURSE.md flavours: `⬜ 1. Title`, `- ⬜ Section 1: Title`, and the `| # | **Title** | 🔄 In progress |`
   table. Streak: consecutive days with activity from LEARNING-LOG/Progress Log dates (today or yesterday counts).
2. **status** — table: course, kind, progress bar + done/total, current section, due cards, last active; footer with
   overall streak. `--json` flag for scripting. Empty state: hint `professor:new-topic` / `course-professor install`.
3. **next [slug]** — resolves the active course (only one, or the most recently active, or `slug`); prints current
   section, the lecture's 🎯 Objectives + first paragraph of Explanation (from LECTURE.md), exercise path + success
   criteria, and "Continue in your agent: `/professor:next` (Claude Code) …" per detected agent. Never prints solutions.
4. **check [slug]** — finds the Active exercise file; by extension runs: `.py` → `python3 <file>`; `.js/.mjs` → `node
   <file>`; `.ts` → `npx --yes tsx <file>` only if tsx is resolvable, else explain; `.go` → `go run`; `.rs` → explain
   `rustc`; `.sql` → explain (no DB) ; `.md` (non-programming kinds) → print the success-criteria / rubric checklist
   and ask the learner to self-assess (y/n per item) and append the result to LEARNING-LOG.md under the section.
   Use `spawn` with args array (no shell), 30 s timeout, cwd = course dir. Parse results: a failing assert / non-zero
   exit = FAIL with the first error line; lines like `✓ name` / `✗ name` or `PASS:`/`FAIL:` from skeleton self-checks
   are shown per check. Exit code 0 only when all pass.
5. **doctor** — checks with ✓/✗/⚠ + fix hint: Node ≥ 18, git, inside a git repo (only required for programming
   courses), agent CLIs on PATH (claude, opencode, cursor-agent, gemini), Professor installed for which agents (reuse
   platform detection), Ollama reachable at :11434, port 3000 free or server up (`/api/studio/health` if present),
   `~/.professor/professor.db` exists, python3/go available for `check`.
6. Help text + EXAMPLES updated; commands work via `node bin/cli.js <cmd>`.

## Verify before reporting
1. `npm test` passes (existing 101 + yours: parser for the 3 COURSE.md flavours, kind default, streak incl. yesterday,
   check result parsing, status --json shape).
2. Run YOUR worktree's CLI against the real courses in the main repo (`learning/` is gitignored, so it only exists
   there): `cd /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin && node <your-worktree>/bin/cli.js status`,
   `… next nextjs`, `… doctor` — paste the outputs in your summary. Never write into the main repo's learning/.
3. `git diff --stat <base>..HEAD` only lists owned files.
Then commit and notify.
