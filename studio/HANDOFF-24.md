# HANDOFF-24 — Phase 24 (Practice & Retention)

Phase 24 is implemented within the files it owns. Nothing below was changed by this phase — each
item is a request for the orchestrator to apply during integration, or a note for reviewers.

## 1. `repo.listCards()` / `repo.nextDueAt()` are missing (repo is Phase 22-owned)

Phase 24 needs to (a) dedupe generated flashcards against the lesson's existing cards and (b) show
the next due time in the Review empty state. The repository has `listDueCards()` but no "all cards"
reader, and `repo/index.js` is owned by Phase 22, so it was not modified.

- Workaround shipped now: `studio/src/components/practice/card-store.js` reads `repo.exportAll()` and
  filters `tables.cards`. It is correct and self-contained but reads/serialises every table.
- Requested change (repo/index.js), to replace the workaround during integration:
  ```js
  /** @param {{ courseId?: string|null, lessonId?: string|null }} [q] */
  export async function listCards({ courseId, lessonId } = {}) {
    const where = {};
    if (courseId) where.course_id = courseId;
    if (lessonId) where.lesson_id = lessonId;
    return adapter.list('cards', { where, orderBy: { field: 'due_at', dir: 'asc' } });
  }
  ```
  `cards` already indexes `course_id` and `lesson_id`, so this is a dumb indexed list — no business
  logic in the adapter. Then `card-store.js` can call `repo.listCards` instead of `exportAll()`.

## 2. Demo `quiz_seed` uses `answer`, the brief specifies `answerIndex`

`studio/src/data/demo-course.js` (Phase 22-owned) stores each seeded question as
`{ question, options, answer, explanation }` — key `answer`, not `answerIndex`. Phase 24 does not
touch that file; instead `lib/prompts/practice.js` normalises **both** keys
(`normalizeQuizItem` / `answerIndexOf`) and validates against `answerIndex`. So the demo quiz renders
with no provider and generated quizzes use the canonical `answerIndex`. No change required — this is
just the reason the normaliser accepts two field names.

## 3. Requirements checkboxes

`PRACTICE-01..04` in the main repo `.planning/REQUIREMENTS.md` are still `[ ]`. That file is outside
this worktree; tick them when integrating.

## 4. Activity kinds written by this phase

`logActivity` kinds: `quiz` (per completed attempt), `flashcards` (per saved batch), `review` (once
per review session). `lesson_done` was already written by `pages/Lesson.jsx`. `StreakBadge` reads all
kinds via `lib/activity.js`, so any new kind automatically counts toward the streak.

## 5. Intentionally untouched

- `components/Layout.jsx` still renders `DueBadge` only. `StreakBadge` is rendered by `pages/Home.jsx`
  (PRACTICE-04 says Home), so no Layout change was needed.
- `lib/course.js` still exports `streak()`; Phase 24 added the row-based
  `lib/activity.js#computeStreak/computeStudyDays` (local-day, DST-safe) and does not use the old
  helper. Both can coexist.
