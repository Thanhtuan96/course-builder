-- 0006_interactive_exercises.sql — interactive exercise widgets (RON-266).
--
-- Two additive tables backing in-page practice for non-code courses:
--   • exercises          — one authored exercise spec per row (JSON as TEXT, validated on read)
--   • exercise_attempts  — append-only attempt log (submitted rows + deterministic result)
--
-- `0006` was informally reserved for the backlogged RON-178 run-results work; taking it here is
-- deliberate and is called out in the PR.
--
-- D1-compatible: TEXT primary keys (UUID), owner_id on every table, ISO-8601 TEXT timestamps +
-- deleted_at tombstones, JSON stored as TEXT, no PRAGMA, no extensions. src/lib/repo/schema.js
-- mirrors these tables/indexes so the IndexedDB adapter exposes the same shape; the migration stays
-- additive so an existing 0001-0005 database upgrades without data loss.

CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  course_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  type TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  external_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS exercise_attempts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  course_id TEXT,
  lesson_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  rows_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  correct INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_exercises_course_id ON exercises(course_id);
CREATE INDEX IF NOT EXISTS idx_exercises_lesson_id ON exercises(lesson_id);
CREATE INDEX IF NOT EXISTS idx_exercises_external_id ON exercises(external_id);

CREATE INDEX IF NOT EXISTS idx_exercise_attempts_exercise_id ON exercise_attempts(exercise_id);
CREATE INDEX IF NOT EXISTS idx_exercise_attempts_lesson_id ON exercise_attempts(lesson_id);
CREATE INDEX IF NOT EXISTS idx_exercise_attempts_course_id ON exercise_attempts(course_id);
