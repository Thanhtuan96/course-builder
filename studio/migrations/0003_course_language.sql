-- 0003_course_language.sql — remember the learner's lesson language per course (brief §16).
--
-- NewCourse lets the learner pick a "Lesson language" (e.g. Vietnamese) when creating a course.
-- Without storing it on the course, lesson/quiz/flashcard/tutor prompts fell back to the global
-- settings language and produced English. Nullable so existing courses (NULL) keep using the
-- settings language.
--
-- D1-compatible: plain `ALTER TABLE ... ADD COLUMN` (nullable, no default), no PRAGMA, no
-- extensions. src/lib/repo/schema.js mirrors this column so the IndexedDB adapter exposes the
-- same shape.

ALTER TABLE courses ADD COLUMN language TEXT;
