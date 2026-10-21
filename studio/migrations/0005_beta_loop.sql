-- 0005_beta_loop.sql — beta learning loop (INSTR-01..04, DEBT-03).
--
-- Three additive tables backing the private-beta instrumentation:
--   • learning_events  — one content-free row per meaningful learning action (D-01/D-04/D-05)
--   • revision_links   — explicit or inferred link from feedback to a revised attempt (D-06/D-07)
--   • beta_profile     — singleton activation row (`id = 'local'`) (D-08)
--
-- `lesson_completed` is deliberately NOT recorded here (D-01): only the six meaningful kinds count
-- for activation, week-1 and week-2.
--
-- D1-compatible: TEXT primary keys (UUID), owner_id on every table, ISO-8601 TEXT timestamps +
-- deleted_at tombstones, JSON stored as TEXT, no PRAGMA, no ALTER, no extensions.
-- src/lib/repo/schema.js mirrors these tables/indexes so the IndexedDB adapter exposes the same
-- shape; the migration stays additive so an existing 0001-0004 database upgrades without data loss.

CREATE TABLE IF NOT EXISTS learning_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  surface TEXT NOT NULL,
  course_id TEXT,
  lesson_id TEXT,
  ref_id TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS revision_links (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  surface TEXT NOT NULL,
  course_id TEXT,
  lesson_id TEXT,
  attempt_table TEXT NOT NULL,
  -- NULL means there is no prior attempt to compare against; a valid explicit `revisionOf`
  -- still links the supplied feedback row to the revised attempt (D-06/D-07).
  attempt_id TEXT,
  feedback_table TEXT,
  feedback_id TEXT,
  revised_table TEXT NOT NULL,
  revised_id TEXT NOT NULL,
  link_kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS beta_profile (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  participant_id TEXT NOT NULL,
  activated_at TEXT,
  activated_day TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_learning_events_day ON learning_events(day);
CREATE INDEX IF NOT EXISTS idx_learning_events_kind ON learning_events(kind);
CREATE INDEX IF NOT EXISTS idx_learning_events_surface ON learning_events(surface);
CREATE INDEX IF NOT EXISTS idx_learning_events_course_id ON learning_events(course_id);
CREATE INDEX IF NOT EXISTS idx_learning_events_lesson_id ON learning_events(lesson_id);

CREATE INDEX IF NOT EXISTS idx_revision_links_surface ON revision_links(surface);
CREATE INDEX IF NOT EXISTS idx_revision_links_course_id ON revision_links(course_id);
CREATE INDEX IF NOT EXISTS idx_revision_links_lesson_id ON revision_links(lesson_id);
CREATE INDEX IF NOT EXISTS idx_revision_links_attempt_id ON revision_links(attempt_id);
CREATE INDEX IF NOT EXISTS idx_revision_links_revised_id ON revision_links(revised_id);
CREATE INDEX IF NOT EXISTS idx_revision_links_link_kind ON revision_links(link_kind);
