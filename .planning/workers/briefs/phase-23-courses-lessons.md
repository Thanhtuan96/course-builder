# Task brief: Phase 23 — Courses & Lessons

You implement one phase of milestone v3.0 **Professor Studio** (`studio/`, static Vite SPA: React 19, Tailwind v4,
react-markdown 10, @anthropic-ai/sdk, hash routing). You work in your own git worktree branched from the merged
Phase 22 foundation. Other workers implement Phases 23–26 IN PARALLEL in other worktrees — so you must ONLY edit the
files listed under "Files you own". If you believe another file must change, do not change it: write the needed change
in `studio/HANDOFF-23.md` and the orchestrator will apply it during integration.
Commit on your branch in small conventional commits. Do NOT push.

Read first (main repo, absolute paths):
- /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/ROADMAP.md (your phase + contracts), /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/REQUIREMENTS.md
- /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/research/FEATURES.md, /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/research/PITFALLS.md, /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/research/ARCHITECTURE.md (sections relevant to you)
Then read in your worktree: `studio/src/lib/repo/index.js` (the ONLY data API), `studio/src/lib/ai/index.js` +
`useStream.js` (AI calls, streaming, errors), `studio/src/lib/prompts/base.js`, `studio/src/components/ui/*`,
`studio/src/pages/Lesson.jsx` and the stub file(s) you replace. Reuse these; do not create parallel utilities.

Product rules: hybrid pedagogy (lessons explain fully; exercises are never solved for the learner — no "reveal solution"
control anywhere); every AI action shows streaming progress, a Stop button and an actionable ErrorNotice; nothing a
learner produced is ever overwritten or lost (use the repo's version/attempt/history functions); works on phone width.

## Requirements
COURSE-01, COURSE-02, COURSE-03, COURSE-05, LESSON-01, LESSON-02, LESSON-03, LESSON-04, LESSON-05 (see REQUIREMENTS.md).

## Files you own
`studio/src/pages/Home.jsx`, `pages/NewCourse.jsx`, `pages/Course.jsx`, `studio/src/components/course/*`
(including replacing the stub `LessonContent.jsx` — keep its export name and props `{ lesson, course }`),
`studio/src/lib/prompts/course.js`, `studio/src/lib/prompts/lesson.js`, tests for them.

## Build
- **NewCourse** (`#/new`): form topic, level (Beginner/Intermediate/Advanced/Expert), goal, optional language
  (default from settings, Vietnamese/English at least). "Propose syllabus" → `generateJson` with `prompts/course.js`
  → validated `{ title, description, lessons:[{title, summary}] }` (4–10 lessons). Show an editable list: rename,
  edit summary, reorder (up/down buttons), add, delete; "Regenerate". "Start course" → `repo.createCourse` → navigate.
- **Home** (`#/`): "Continue learning" card (most recent active course + next lesson), course grid with progress bars
  (done/total), `<StreakBadge/>` and `<DueBadge/>` (import from components/practice — do not edit them), empty state
  with CTA "Create your first course" + "Open demo course", delete course (confirm dialog, soft delete).
- **Course** (`#/course/:id`): header (title, level, goal, progress), lesson list with status icons, lesson summaries,
  "Start/Continue" buttons; completed lessons show completion date and reflection snippet (from `getLessonHistory`).
  "Export COURSE.md" button is NOT yours (Phase 26) — leave room in the header actions (a `<CourseActions course/>`
  placeholder is not needed; just leave space).
- **LessonContent**: if the lesson has a current version → render with the shared `<Markdown>`; show version picker
  ("v2 · generated 10:42 · model") when >1 version; "Regenerate" adds a new version (confirm first: costs tokens).
  If no version → "Generate lesson" streams Markdown via `useStream` with `prompts/lesson.js`, then
  `repo.addLessonVersion`. Demo-course lessons already have content.
- **Course kind (COURSE-05)**: the syllabus JSON also returns `kind` (one of `COURSE_KINDS` from lib/course.js) +
  `kindReason`; NewCourse shows it as a selectable chip row with the reason ("Detected: Conceptual — history topic"),
  learner can change it before "Start course"; saved via `repo.createCourse({ kind })`. Course page shows the kind badge.
- **prompts/lesson.js (LESSON-05)**: `buildLessonMessages({ course, lesson, level, language })` = `PROFESSOR_PERSONA` +
  `courseContext` + the shared core from `LEARNING_CORE_SECTIONS` (base.js) as `##` headings in this order:
  Objectives (2–3 "you will be able to…"), Explanation, Worked example, Common misconceptions,
  Check your understanding (2–3 questions; answers in a collapsed `<details>`-free form: put them under a final
  "Answers to check yourself" list — NOT next to the questions), Exercise (+ success criteria checklist, NEVER the
  solution), Key takeaways (3–5 bullets), Resources (only well-known sources; say "verify links" if unsure).
  Plus kind-specific blocks inserted after Worked example:
  * programming → "Code walkthrough" (annotated snippet), exercise = file skeleton in the course's language with TODOs
    and a small self-check test block the learner can run; never the finished implementation.
  * quantitative → "Step-by-step worked problem" using KaTeX (`$...$`, `$$...$$`), exercise = 3–5 problems with FINAL
    answers only (no worked solutions).
  * conceptual → "Case study / story", a ```mermaid concept map or timeline, exercise = short analysis/argument with a
    4-criterion rubric.
  * skill → "Model examples" (good vs. common mistake), exercise = drills + self-assessment checklist; suggest which
    items to turn into flashcards.
  Level-appropriate depth (Beginner→Expert table from the plugin's SKILL.md), learner's language, ~700–1400 words.
  Unit-test the builder per kind (headings present, kind block present, no-solution rule present).
- **prompts/course.js**: JSON-only instructions + `validateSyllabus(obj)` returning `{ ok, value, error }`.

## Verify before reporting
1. `cd studio && npm test` passes (add tests for your pure logic: prompt builders, validators, reducers).
2. `npm run build` passes.
3. `git diff --stat <base>..HEAD` lists only files you own (+ optional `studio/HANDOFF-*.md`).
4. Manually exercise your feature with `npm run dev` + the demo course (no provider) and, if available, a provider.
Final notify summary: commits, tests, and anything left in HANDOFF.
