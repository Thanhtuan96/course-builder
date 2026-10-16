-- 0002_external_ids.sql — stable external keys for CLI imports (CLI-07).
--
-- The CLI (`course-professor import`) imports course files into this SQLite database. To make
-- re-running idempotent it stores a stable `external_id` (e.g. `cli:<slug>`, `cli:<slug>:<n>`)
-- alongside `source = 'cli'`. These columns are nullable so existing rows and AI-created courses
-- are unaffected.
--
-- D1-compatible: plain `ALTER TABLE ... ADD COLUMN` (nullable, no default) + `CREATE INDEX IF
-- NOT EXISTS`, no PRAGMA, no extensions. src/lib/repo/schema.js mirrors these columns/indexes so
-- the IndexedDB adapter exposes the same shape.

ALTER TABLE courses ADD COLUMN external_id TEXT;
ALTER TABLE lessons ADD COLUMN external_id TEXT;
ALTER TABLE lesson_versions ADD COLUMN external_id TEXT;
ALTER TABLE cards ADD COLUMN external_id TEXT;

CREATE INDEX IF NOT EXISTS idx_courses_external_id ON courses(external_id);
CREATE INDEX IF NOT EXISTS idx_lessons_external_id ON lessons(external_id);
CREATE INDEX IF NOT EXISTS idx_lesson_versions_external_id ON lesson_versions(external_id);
CREATE INDEX IF NOT EXISTS idx_cards_external_id ON cards(external_id);
