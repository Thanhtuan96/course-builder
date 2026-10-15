# HANDOFF — Phase 23 (Courses & Lessons)

Phase 23 needs **no changes outside the files it owns**. Notes for integration:

## Repo API
- `repo.createCourse({ title, description, level, goal, kind, source, lessons })` already persists
  `kind` and per-lesson `{ title, summary }` — no repository change required.
- Lesson generation appends via `repo.addLessonVersion(...)`; `lesson.current_version_id` is updated
  by the repo. Nothing is overwritten.
- Completion reflection snippet on the Course page comes from `repo.getLessonHistory(lessonId).reflection`.

## Component contracts
- `components/course/LessonContent.jsx` keeps its export name and `{ lesson, course }` props
  (mounted by `pages/Lesson.jsx`). It now loads/selects versions, streams generation through
  `useStream`, and offers Regenerate (confirm-before-cost).
- `pages/Home.jsx` imports `<StreakBadge/>` and `<DueBadge/>` from `components/practice/*` (Phase 24
  owns those files — this phase did not edit them).
- `pages/Course.jsx` header has an empty action container reserved for the Phase 26
  "Export COURSE.md" button (do not remove the container).

## Demo course
Demo lessons ship with `content_md`, so they resolve to version 1 and render with no provider.

## Not done here (other phases)
- "Export COURSE.md" (Phase 26), quiz/flashcards (Phase 24), tutor (Phase 25), code workspace (Phase 29).
