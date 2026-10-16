# Task brief: Phase 27 — Plugin Lesson History

You are implementing one phase of milestone v3.0 in the Professor plugin repo. You work in your own git worktree
(your current directory). Commit your work on your branch when done (conventional commits, small logical commits).
Do NOT push. Do NOT touch `studio/`.

## Problem (confirmed by the orchestrator)
- `commands/professor/next.md:33` says "Write `LECTURE.md` for that section (overwrite any existing file)" → the previous
  lecture is lost forever.
- `web/server.js` `saveFilesFromResponse()` (+ `saveCourseFile`) overwrites `LECTURE.md` the same way.
- `commands/professor/done.md` only flips status to ✅, adds a Progress Log row and SCHEDULE.md flashcards. The Coach
  self-assessment (hardest concept, learner answers, verdict, ⚠️ watch-this), and quiz results are never persisted.
- TODOS.md already lists "Archive previous LECTURE.md before `professor:next` overwrites it".

## Requirements
- **PLUG-01**: Before a new `LECTURE.md` is written, archive the existing one to `lectures/NN-section-slug.md` inside the
  course dir (`learning/{slug}/` or legacy `courses/{slug}/`). `NN` = zero-padded section number of the archived lecture
  (parse it from the lecture's `# Section N:` / `# 📖 Section N:` heading; fall back to next free number). Never delete
  archives (the TODO's "keep last 3–5" idea is REJECTED — learners want full history).
- **PLUG-02**: `professor:done` writes a section entry to `LEARNING-LOG.md`: date, section, duration, Coach questions +
  learner answers (summarised faithfully), Coach verdict (solid / ⚠️ watch-this: concept), archived lecture path.
- **PLUG-03**: `professor:quiz` appends results to `LEARNING-LOG.md` (questions, learner answers, verdict per question,
  concepts to revisit). `professor:progress` and `professor:recall` mention/consult archived lectures in `lectures/`.

## Files you own (edit only these)
- `commands/professor/next.md`, `done.md`, `quiz.md`, `progress.md`, `recall.md`
- the same files under `shared/commands/professor/` (canonical copies — keep them in sync, keep the
  `AskUserQuestion` placeholder convention described in CLAUDE.md)
- `agents/coach.md` (only the part about where the self-assessment is logged)
- `web/server.js` — ONLY `saveFilesFromResponse`/`saveCourseFile` area: add archive-before-overwrite for LECTURE.md.
  Put the archive logic in a new small module `web/lecture-archive.js` (ES module, pure functions:
  `sectionNumberFromLecture(md)`, `archiveFileName(md, existingNames)`, `archiveLecture(courseDir)`), imported by server.js.
- `test/lecture-archive.test.js` (Vitest; repo root `npm test` runs vitest) — unit tests for the pure functions
  incl. heading variants `# Section 2: X`, `# 📖 Section 2: X`, missing heading, slug generation, collisions.
- `CLAUDE.md` — update "Course Storage" / "Core Behavior Rules" lines that say LECTURE.md is disposable/overwritten
  (it is now archived, not lost) and mention `lectures/` + `LEARNING-LOG.md`.
- `TODOS.md` — mark the archive TODO as done (reference Phase 27).

## Rules
- Keep the Socratic rules intact (never write working code for the learner).
- Markdown command files are instructions for an AI agent: write the archive step as an explicit, ordered step
  ("1. If LECTURE.md exists, move it to lectures/NN-<slug>.md (create lectures/ if needed) … 2. Write the new LECTURE.md").
- Don't refactor unrelated code. 2-space indent, semicolons, ES modules in web/.

## Verify before reporting
1. `npm test` at repo root passes (existing 31 tests + yours).
2. `node -e "import('./web/lecture-archive.js').then(m=>console.log(Object.keys(m)))"` prints your exports.
3. `git diff --stat` only shows files from the list above.
Then commit, and in your final notify summary list the commits and test count.
