# Roadmap: Course Learning Plugin

## Milestones

- ✅ **v1.1** — Plugin foundation (Phases 1–12) — shipped 2026-03-08
- ✅ **v2.0** — Local Web UI, retention, multi-agent (Phases 13–17.x, 21) — shipped 2026-03-25
- ⏸ **v2.1** — Cloud/auth/install (Phases 18–20) — deferred, superseded by v3.0 (archive: `milestones/v2.1-ROADMAP.md`)
- 🚧 **v3.0 Professor Studio** — Phases 22–37 (current)

## v3.0 Professor Studio

**Goal:** A learner runs `npm run dev` in `studio/` (or opens the static deploy) and completes the loop — create a course from a prompt → study a generated lesson → quiz → flashcards → Socratic tutor — free with their own key or local agent.

**Execution model:** Claude orchestrates and reviews; OpenCode workers (`opencode-go/deepseek-v4.1-flash`, TUI in cmux) implement. Phase 22 is serial (foundation, owns shared files). Phases 23–26 run **in parallel**, one git worktree each, and must only touch the files they own (listed per phase) to avoid merge conflicts.

| # | Phase | Goal | Requirements | Parallel |
|---|-------|------|--------------|----------|
| 22 | Studio Foundation | App shell, routing, repository layer (normalized schema + IndexedDB adapter), provider layer, Settings | SHELL-01..05, AI-01..05, COURSE-04, DATA-03, LESSON-06 | serial |
| 23 | Courses & Lessons | Create course from prompt, syllabus edit, lesson generation | COURSE-01..03, COURSE-05, LESSON-01..05 | wave 2 |
| 24 | Practice & Retention | Quiz, flashcards SM-2, Review page, streak | PRACTICE-01..04 | wave 2 |
| 25 | Socratic Tutor | Lesson-scoped tutor chat with hybrid rules | TUTOR-01..04 | wave 2 |
| 26 | Local Server, SQLite & Deploy | Local agent bridge, SQLite repository API, backup/export, static deploy, SaaS doc | AI-06, DATA-01, DATA-02, DATA-04, DATA-05, DEPLOY-01..04 | wave 2 |
| 27 | Plugin Lesson History | Archive lectures, log Coach reflections and quiz results in the CLI plugin | PLUG-01..03 | ✓ merged |
| 28 | Plugin Course Kinds | Course kind at creation, kind-aware LECTURE template + exercises, git only for programming | PLUG-04..06 | ✓ merged |
| 29 | Code Workspace | CodeMirror editor, in-browser runners (JS/TS, Pyodide, sql.js, HTML) + local runner, self-checks, snapshots | CODE-01..05 | wave 2 |
| 30 | Dev CLI Fast-path | `status`, `next`, `check`, `doctor` from the terminal | CLI-01..04 | wave 2 |
| 31 | CLI ↔ Studio | `studio` one-command launch, terminal `review`, `import` CLI courses into SQLite | CLI-05..07 | ✓ merged |
| 32 | Integration | Wire merged phases, fix cross-phase bugs found in E2E | — | wave 3 |
| 33 | Capstone | Kind-shaped capstone, unlock, submissions, rubric + automated review, completion | CAP-01..05 | wave 4 (after 32) |
| 34a | Grounded lectures (plugin) | Researched sources, citations, ⚠️ unverified, Verify-it-yourself in CLI lectures | GROUND-07 | wave 4 (parallel) |
| 34b | Grounded lessons (Studio) | Retrieval-first lessons, sources table, link/excerpt/claim checks, SIFT tasks, report-wrong | GROUND-01..06 | wave 7 (after 35) |
| 26c | Multi-agent bridge | Per-agent models, opencode/cursor/gemini/antigravity/ollama runners, OpenRouter, no silent errors | AI-06 (hardening) | wave 4 (parallel with 33) |
| 35 | Language & i18n | One learning language, vi/en UI, localized lesson structure, enforced output language | LANG-01..05 | wave 6 (after 36) |
| 36 | Storage choice | Browser vs local SQLite chosen by the learner, write-only-there, safe move, banner only for browser | STORE-01..04 | ✓ merged |
| 37 | Release packaging | npm 1.6.0-beta.1 (tag next): files, prebuilt Studio, Node 22.5 check, tarball smoke test, CHANGELOG | REL-01..05 | wave 6 (parallel with 35) |

## Phase Details

### Phase 22: Studio Foundation
**Goal**: A runnable Studio shell where every page route exists, data persists, and any of the 4 AI sources can be configured and tested.
**Depends on**: nothing (seed code in `studio/src/lib/`)
**Requirements**: SHELL-01, SHELL-02, SHELL-03, SHELL-04, SHELL-05, AI-01, AI-02, AI-03, AI-04, AI-05, COURSE-04, DATA-03
**Storage design**: all data access goes through `lib/repo/` — a repository API (courses, lessons, lesson_versions, quiz_attempts, cards, reviews, chat_messages, reflections, notes, activity) defined once as SQL migrations in `studio/migrations/NNNN_name.sql` (wrangler D1 migrations layout) and mirrored as JS table metadata in `lib/repo/schema.js` for the IndexedDB adapter. **D1-ready rules**: TEXT primary keys (UUID/ULID), every table has `owner_id` (default `'local'`), `created_at`/`updated_at`/`deleted_at` (tombstones, ISO-8601 TEXT), JSON as TEXT, no PRAGMA/extension dependencies — the same migrations must apply to local `node:sqlite` and to Cloudflare D1 unchanged. Phase 22 ships the IndexedDB adapter + `RemoteAdapter` contract stub; Phase 26 ships the SQLite server. Nothing is ever overwritten: regenerating a lesson adds a `lesson_versions` row.
**Owns (shared files later phases must not restructure)**: `studio/src/main.jsx`, `lib/repo/*`, `studio/migrations/*`, `App.jsx`, `index.css`, `lib/router.js`, `lib/db.js`, `lib/store.js`, `lib/ai/*`, `lib/prompts/base.js`, `components/ui/*`, `components/Layout.jsx`, `pages/*` (Lesson.jsx and Settings.jsx final; others stubs), `data/demo-course.js`, plus **stub files later phases replace in place**: `components/course/*Stub`, `components/practice/{LessonPractice,StreakBadge,DueBadge}.jsx`, `components/tutor/TutorPanel.jsx`, `components/data/DataPanel.jsx`
**Success Criteria**:
1. `npm run dev` serves the app; Home, New, Course, Lesson, Review, Settings routes render (stubs allowed for 23–25 pages)
2. Settings can save each provider and "Test connection" streams a reply or shows an actionable error
3. A demo course is visible and openable with zero configuration
4. `npm test` passes (db, srs, json, course, provider SSE parsing) and `npm run build` succeeds

### Phase 23: Courses & Lessons
**Goal**: Learner creates a course from a prompt, edits the syllabus, and studies generated lessons.
**Depends on**: Phase 22
**Requirements**: COURSE-01, COURSE-02, COURSE-03, LESSON-01, LESSON-02, LESSON-03, LESSON-04
**Owns**: `pages/Home.jsx`, `pages/NewCourse.jsx`, `pages/Course.jsx`, `components/course/*` (incl. `LessonContent.jsx` mounted by Lesson.jsx), `lib/prompts/course.js`, `lib/prompts/lesson.js`
**Success Criteria**:
1. Topic+level+goal → editable syllabus → saved course
2. Opening a lesson streams Markdown content, caches it, renders safely; regenerate works
3. Mark done updates progress on Course and Home

### Phase 24: Practice & Retention
**Goal**: Learner reinforces each lesson with a quiz and spaced-repetition flashcards.
**Depends on**: Phase 22
**Requirements**: PRACTICE-01, PRACTICE-02, PRACTICE-03, PRACTICE-04
**Owns**: `pages/Review.jsx`, `components/practice/*` (LessonPractice, QuizPanel, FlashcardGenerator, StreakBadge, DueBadge), `lib/prompts/practice.js`, `lib/activity.js`
**Success Criteria**:
1. Quiz panel generates 5 valid MCQs (with JSON repair/retry), scores, explains
2. Flashcards from a lesson appear in Review when due; grading reschedules via SM-2
3. Streak and due count render as reusable components

### Phase 25: Socratic Tutor
**Goal**: Learner gets lesson-aware tutoring that teaches without doing the work.
**Depends on**: Phase 22
**Requirements**: TUTOR-01, TUTOR-02, TUTOR-03, TUTOR-04
**Owns**: `components/tutor/*` (TutorPanel), `lib/prompts/tutor.js`, `lib/chat-store.js`
**Success Criteria**:
1. TutorPanel streams replies using lesson + course context
2. Asking for the exercise solution yields guiding questions/layered hints, never full code
3. Quick actions work; history persists per lesson

### Phase 26: Local Server, SQLite & Deploy
**Goal**: Learners can use their local agent for free, keep their data in a SQLite file on disk, move their data, and the app is deployable with a documented SaaS path.
**Depends on**: Phase 22
**Requirements**: AI-06, DATA-01, DATA-02, DATA-04, DATA-05, DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04
**Owns**: new `web/studio-api.js` (Express router: `/api/studio/health`, `/api/studio/complete`, `/api/studio/db/*` on `node:sqlite` at `~/.professor/professor.db`, applying `studio/migrations/*.sql` in order with a `d1_migrations`-compatible tracking table). The `/api/studio/db/*` HTTP contract is the SAME one the future Cloudflare Worker + D1 backend will implement, so `RemoteAdapter` only changes base URL + auth token, exactly ONE mount line in `web/server.js`, `studio/src/lib/repo/remote-adapter.js` (replaces the stub), `studio/src/components/data/*` (Backup/Restore/Export UI mounted in Settings via one import line), `studio/docs/*`, `studio/README.md`
**Success Criteria**:
1. With `npx course-professor web` running, Studio's bridge provider streams replies from the local agent; requests from non-allowlisted origins or without the pairing token are rejected
2. With the server running, Studio stores data in `~/.professor/professor.db`; without it, IndexedDB; "Import from browser storage" moves IDB data into SQLite losslessly
3. Backup → restore round-trips all data in another browser profile; keys are excluded
4. Exported COURSE.md parses with `parseCourseMarkdown` and matches plugin format
5. `npm run build` output deploys to void.cloud following `studio/docs/DEPLOY.md`; `SAAS-ROADMAP.md` exists

### Phase 27: Plugin Lesson History
**Goal**: CLI/web-UI learners never lose a lecture or their reflections when a section is done.
**Depends on**: nothing (independent of Studio)
**Requirements**: PLUG-01, PLUG-02, PLUG-03
**Owns**: `commands/professor/{next,done,quiz,progress,recall}.md`, matching files in `shared/commands/professor/`, `agents/coach.md` (logging section only), `web/server.js` `saveFilesFromResponse` (archive-before-overwrite only), `test/` additions, `CLAUDE.md` course-files section
**Success Criteria**:
1. Running next twice leaves the first lecture at `lectures/01-<slug>.md`; `web/` save path does the same
2. After done, `LEARNING-LOG.md` contains the section's reflection, verdict and duration
3. Quiz results are appended to `LEARNING-LOG.md`; progress/recall mention archived lectures
4. `npm test` passes, including a unit test for the archive helper

### Phase 28: Plugin Course Kinds
**Goal**: CLI learners of non-programming topics get lectures and exercises that fit their subject, without git/code scaffolding.
**Depends on**: Phase 27 (merged)
**Requirements**: PLUG-04, PLUG-05, PLUG-06
**Owns**: `commands/professor/{new-topic,next,hint,review}.md` + `shared/` copies, `professor-skill/SKILL.md` (LECTURE.md Format + level table), `agents/professor.md` (lecture/exercise sections), `CLAUDE.md`, `test/` (if any helper)
**Success Criteria**:
1. new-topic asks/confirms kind and writes `**Kind**:` to COURSE.md
2. A conceptual course is created without git; a programming course still gets a worktree
3. LECTURE.md template has the shared learning core + kind blocks; exercise generation follows kind (no keyword heuristic, no JS default)

### Phase 29: Code Workspace
**Goal**: Programming learners write, run and self-check exercise code inside Studio without installing anything, and can use their real toolchain locally.
**Depends on**: Phase 22 (slot + tables)
**Requirements**: CODE-01..05
**Owns**: `studio/src/components/workspace/*` (replaces stub `CodeWorkspace.jsx`), `studio/src/lib/runner/*`, NEW `web/studio-runner.js` (Express Router; mounted by integration into `web/studio-api.js` via HANDOFF so it inherits token + CORS)
**Success Criteria**:
1. Workspace tab loads the exercise skeleton; edits autosave as snapshots
2. Run works offline-in-browser for JS/TS, Python, SQL, HTML; Check shows per-test pass/fail
3. With the local server, a Go/Java/etc. file runs via the installed toolchain with a timeout and output limits
4. Tutor "Check my answer" can include the current code

### Phase 30: Dev CLI Fast-path
**Goal**: Devs check progress, continue, and verify exercises without leaving the terminal.
**Depends on**: Phase 28 (merged)
**Requirements**: CLI-01..04
**Owns**: `bin/commands/{status,next,check,doctor}.js` (new), `bin/course-reader.js` (new: parse learning/ + courses/ COURSE.md incl. Kind, lectures/, SCHEDULE.md, LEARNING-LOG.md), the matching `case` lines + help text in `bin/cli.js`, `test/cli-*.test.js`, README CLI section

### Phase 31: CLI ↔ Studio
**Goal**: One command launches the full local platform; CLI and Studio share one learning record.
**Depends on**: Phase 26 (server + SQLite), Phase 30
**Requirements**: CLI-05..07

## Integration (after wave 2)
Orchestrator merges worktrees in order 23 → 24 → 25 → 26 → 27 into `feat/studio-local-first` (panels are already mounted via Phase 22 stubs, so merges replace files without conflicts), runs `npm test && npm run build`, and does a UAT pass of the full learning loop.
