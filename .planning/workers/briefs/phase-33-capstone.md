# Task brief: Phase 33 — Capstone in Studio (final project / end-of-course assessment)

Own git worktree branched from `feat/studio-local-first` AFTER Phase 32 (integration) is merged. You are the only worker
running. Small conventional commits. Do NOT push.

Read first (main repo): `.planning/REQUIREMENTS.md` (CAP-01..05), `.planning/ROADMAP.md`. In your worktree read the plugin's
capstone behaviour, which Studio must match: `commands/professor/capstone.md`, `capstone-review.md`,
`professor-skill/SKILL.md` (CAPSTONE.md format + Absolute Rules: no hints/stuck/code during capstone, `discuss` only),
`agents/coach.md`. Then Studio: `lib/repo/index.js` + `schema.js` + `studio/migrations/*` (next number after the
latest — expect `0004`), `lib/prompts/{base,course,lesson,tutor}.js`, `pages/{Course,Lesson,NewCourse}.jsx`,
`components/tutor/TutorPanel.jsx`, `components/workspace/*` + `lib/runner/*` (Phase 29 runner, checks parsing),
`components/data/DataPanel.jsx` (export pattern), `bin/commands/import.js` + `bin/course-reader.js`.

## Requirements
- **CAP-01 brief**: generate the capstone with the syllabus in NewCourse (same JSON call or a second `generateJson`), shaped
  by `kind`:
  * programming → project brief (scope, core features, stretch goals, rules) + `tests`: a runnable self-check test file in
    the course language using the Phase 29 checks convention (e.g. Python asserts / JS `check(name, fn)`), testing
    observable behaviour only — never a reference solution;
  * conceptual → essay/analysis prompt with sources to use;
  * quantitative → integrated problem set (final answers hidden from the learner, stored for review only);
  * skill → performance task + self-assessment checklist.
  Every capstone has a 4–6 criterion **rubric** (criterion, what "solid" looks like). Store immutable: table `capstones`
  (id, owner_id, course_id, kind, brief_md, rubric_json, tests_json, hidden_answers_json, created_at, updated_at,
  deleted_at) in migration `000N_capstone.sql` (D1-safe) + schema.js + repo functions `getCapstone(courseId)`,
  `createCapstone(...)` (no update API — immutable). Courses created before this phase: "Generate capstone" button once.
  Demo course: a bundled conceptual capstone (no provider needed).
- **CAP-02 unlock + capstone mode**: Course page shows a Capstone card: 🔒 until all lessons are done (show progress),
  then "Start capstone" → route `#/course/:id/capstone`. While a capstone is in progress, TutorPanel (course-wide and in
  the capstone page) uses a `capstone` mode: concept discussion only; explicitly refuses hints, step lists, code or
  answers for the capstone; add `CAPSTONE_RULES` in `lib/prompts/tutor.js` + tests (red-team prompts).
- **CAP-03 submissions**: capstone page with brief + rubric, a submission form (text/markdown, optional repo URL, and for
  programming "Use my Workspace files" which snapshots the learner's workspace files for a `capstone` pseudo-lesson
  id), unlimited attempts. Table `capstone_submissions` (id, owner_id, capstone_id, attempt, content_md, repo_url,
  files_json, test_results_json, review_json, verdict, created_at, updated_at, deleted_at) in the same migration. Never
  overwrite: each attempt is a new row; show history with verdicts.
- **CAP-04 review**: for programming, first run `tests_json` against the submitted files with the Phase 29 runner
  (browser when supported, local runner otherwise) and capture per-check results; then `generateJson` a review with
  `lib/prompts/capstone.js#buildCapstoneReviewMessages({ capstone, submission, testResults, course })` →
  `{ verdict: 'course_complete'|'needs_work', criteria:[{ name, rating: solid|partial|missing, feedback }], strengths:[],
  nextAction }`. Rules: feedback is Socratic and specific, NEVER rewrites or supplies the solution/code/answers; a failing
  automated test caps the verdict at `needs_work`; quantitative uses `hidden_answers_json` only to judge correctness and
  must not reveal them. Validate JSON strictly; one repair retry.
- **CAP-05 completion**: on `course_complete` → completion page (course, date, attempts, rubric summary, "you built this
  yourself") and "Export COMPLETION.md" in the plugin format from `capstone-review.md` (verdict: Course Complete, etc.).
  Course list shows a 🎓 badge. `bin/commands/import.js`: import `CAPSTONE.md` → capstones.brief_md (rubric parsed if
  present, else empty), `COMPLETION.md` → a submission row with verdict course_complete; idempotent via external_id.

## Files you own
`studio/migrations/000N_capstone.sql`, `lib/repo/schema.js` + `lib/repo/index.js` (capstone functions only),
NEW `lib/prompts/capstone.js`, `lib/prompts/course.js` (capstone part of syllabus generation),
`lib/prompts/tutor.js` (capstone mode), NEW `pages/Capstone.jsx`, NEW `components/capstone/*`, `pages/Course.jsx`
(capstone card + badge), `pages/NewCourse.jsx` (generate/save capstone), `pages/Home.jsx` (badge), `App.jsx`/router
(new route), `components/tutor/TutorPanel.jsx` (mode switch), `data/demo-course.js` (demo capstone),
`bin/commands/import.js`, tests (studio + root), docs (studio/README.md capstone section).

## Verify before reporting
1. Root `npm test`, `cd studio && npm test`, `npm run build` pass; migration applies on node:sqlite from scratch AND on a DB
   that already has 0001–0003 (test both).
2. Unit tests: capstone JSON validators, review prompt never-solution rules, test-cap rule, tutor capstone-mode red-team,
   import of CAPSTONE.md/COMPLETION.md idempotent.
3. Manual with `node bin/cli.js studio --no-open --port 5192 --api-port 3012` and a temp `PROFESSOR_HOME`: demo course →
   finish lessons → capstone unlocks → submit → review shows verdict. Describe what you saw.

## Framing addendum (user decision 2026-10-15 — "capstone = ship the artifact")
The user wants practical, real-world learning where the ARTIFACT is central (full model planned for v3.2, see
`.planning/seeds/SEED-002-artifact-first-learning.md`). For v3.0 apply the light version:
- The capstone is framed as **"Ship your artifact"**: the brief names ONE concrete, real deliverable (e.g. a deployed
  mini-app + repo, a 1,500-word analysis memo with sources, a data notebook + report on a public dataset, a recorded
  performance) with an explicit **Definition of Done** list, alongside the rubric. UI copy: "Your artifact", not "exam".
- `lib/prompts/course.js`: the syllabus JSON also returns `artifact: { title, deliverable, definitionOfDone[] }`; NewCourse
  shows "What you'll ship" above the lessons (editable before Start course). The capstone brief is generated from it.
  Lesson prompts (`lib/prompts/lesson.js`) get one line of context: "This course builds toward: <artifact>" so exercises
  point at pieces of that artifact where natural (no milestone engine yet — that is v3.2).
- Completion page + COMPLETION.md include the artifact (title, link/repo if given, final submission summary) so it is
  portfolio-ready.
- Store the artifact object inside the capstone row (`brief_md` + a new `artifact_json` column in the same migration).
- Owned-files addition for this addendum: `lib/prompts/lesson.js` (the single "builds toward" context line + its test).

## Polish addendum (orchestrator E2E on c2be47c — lesson language + Mermaid now verified working)
In `lib/prompts/lesson.js` (owned by you for this phase): section headings and the "Misconception: … → Reality: …" labels
are still emitted in English for a Vietnamese course. Localize the learning-core headings/labels per `course.language`
(at least Vietnamese + English; fall back to English), keep a stable internal section id so any code that finds sections
does not depend on the heading text, and update the lesson prompt tests. Apply the same to the capstone page copy.
