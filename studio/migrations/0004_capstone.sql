-- 0004_capstone.sql — capstone brief + submissions (CAP-01..05).
--
-- A capstone is created once per course (at creation, or later for courses that predate this
-- phase) and is IMMUTABLE: `repo.createCapstone` never updates an existing row, so the learner
-- always builds against the original brief. Submissions are append-only too — every attempt is a
-- new `capstone_submissions` row and nothing is ever overwritten.
--
-- `external_id` makes `course-professor import` idempotent (CAP-05): re-importing CAPSTONE.md /
-- COMPLETION.md updates-or-skips instead of duplicating.
--
-- D1-compatible: TEXT primary keys (UUID), owner_id on every table, ISO-8601 TEXT timestamps +
-- deleted_at tombstones, JSON stored as TEXT, no PRAGMA, no extensions. src/lib/repo/schema.js
-- mirrors these tables/indexes so the IndexedDB adapter exposes the same shape.

CREATE TABLE IF NOT EXISTS capstones (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  course_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'conceptual',
  brief_md TEXT,
  rubric_json TEXT,
  tests_json TEXT,
  hidden_answers_json TEXT,
  artifact_json TEXT,
  external_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS capstone_submissions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  capstone_id TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  content_md TEXT,
  repo_url TEXT,
  files_json TEXT,
  test_results_json TEXT,
  review_json TEXT,
  verdict TEXT,
  external_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_capstones_course_id ON capstones(course_id);
CREATE INDEX IF NOT EXISTS idx_capstones_external_id ON capstones(external_id);
CREATE INDEX IF NOT EXISTS idx_capstone_submissions_capstone_id ON capstone_submissions(capstone_id);
CREATE INDEX IF NOT EXISTS idx_capstone_submissions_external_id ON capstone_submissions(external_id);
