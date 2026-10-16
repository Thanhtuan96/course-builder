# Task brief: Phase 24 — Practice & Retention

You implement one phase of milestone v3.0 **Professor Studio** (`studio/`, static Vite SPA: React 19, Tailwind v4,
react-markdown 10, @anthropic-ai/sdk, hash routing). You work in your own git worktree branched from the merged
Phase 22 foundation. Other workers implement Phases 23–26 IN PARALLEL in other worktrees — so you must ONLY edit the
files listed under "Files you own". If you believe another file must change, do not change it: write the needed change
in `studio/HANDOFF-24.md` and the orchestrator will apply it during integration.
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
PRACTICE-01, PRACTICE-02, PRACTICE-03, PRACTICE-04.

## Files you own
`studio/src/pages/Review.jsx`, `studio/src/components/practice/*` (replace stubs `LessonPractice.jsx`, `StreakBadge.jsx`,
`DueBadge.jsx` keeping export names/props; add `QuizPanel.jsx`, `FlashcardGenerator.jsx`, `FlashcardReviewer.jsx`),
`studio/src/lib/prompts/practice.js`, `studio/src/lib/activity.js`, tests.

## Build
- **LessonPractice `{ lesson, course }`**: two sections — Quiz and Flashcards — plus a list of past quiz attempts.
- **QuizPanel**: if the lesson has `quiz_seed` (demo course) use it, otherwise `generateJson` 5 MCQs from the lesson
  content (`prompts/practice.js`): `[{question, options[4], answerIndex, explanation}]`, validated (exactly 4 options,
  answerIndex 0–3, non-empty strings, no duplicate options); one repair retry (built into generateJson); show one
  question at a time, reveal correct/incorrect + explanation after answering, final score, "Retake" (new attempt,
  same questions) and "New quiz". Save every attempt with `repo.saveQuizAttempt` and `logActivity('quiz')`.
  Quizzes are self-check retrieval practice — wording: "Check your understanding", never "grade".
- **FlashcardGenerator**: `generateJson` 5–8 cards `{front, back}` from the lesson; preview + edit/delete before
  saving with `repo.addCards`; dedupe against existing cards of the lesson.
- **Review page** (`#/review`): due cards across all courses (`repo.listDueCards`), flip card, grade Again/Hard/Good/
  Easy (keyboard 1–4, space to flip) → `repo.gradeCard`; session summary; empty state "All caught up" + next due time.
- **activity.js**: `getStreak()` / `getStudyDays(n)` from `repo.listActivity()` (local-day boundaries, today or
  yesterday counts as current streak) with unit tests (DST + timezone safe).
- **StreakBadge** (flame-free: use a small calendar dot row or number + "day streak"), **DueBadge** (count, hidden at 0),
  both reactive to repo `change` events.

## Verify before reporting
1. `cd studio && npm test` passes (add tests for your pure logic: prompt builders, validators, reducers).
2. `npm run build` passes.
3. `git diff --stat <base>..HEAD` lists only files you own (+ optional `studio/HANDOFF-*.md`).
4. Manually exercise your feature with `npm run dev` + the demo course (no provider) and, if available, a provider.
Final notify summary: commits, tests, and anything left in HANDOFF.
