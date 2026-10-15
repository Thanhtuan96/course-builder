-- 0001_init.sql — Professor Studio schema.
--
-- D1-compatible: TEXT primary keys (UUID), owner_id on every table, ISO-8601 TEXT
-- timestamps + deleted_at tombstones, JSON stored as TEXT, no PRAGMA, no extensions.
-- The same file applies unchanged to local `node:sqlite` and Cloudflare D1.
-- Business logic lives in src/lib/repo/index.js; this schema is the source of truth
-- that src/lib/repo/schema.js mirrors for the IndexedDB adapter.

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  title TEXT NOT NULL,
  description TEXT,
  level TEXT,
  kind TEXT NOT NULL DEFAULT 'conceptual',
  goal TEXT,
  topics_json TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  course_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  completed_at TEXT,
  current_version_id TEXT,
  quiz_seed TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS lesson_versions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  lesson_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  content_md TEXT,
  model TEXT,
  provider TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  lesson_id TEXT NOT NULL,
  questions_json TEXT,
  answers_json TEXT,
  score INTEGER,
  total INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  course_id TEXT,
  lesson_id TEXT,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  ease REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  due_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  card_id TEXT NOT NULL,
  grade INTEGER NOT NULL,
  reviewed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  lesson_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  mode TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS reflections (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  lesson_id TEXT NOT NULL,
  hardest TEXT,
  confidence INTEGER,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  course_id TEXT,
  lesson_id TEXT,
  content_md TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_status ON lessons(status);
CREATE INDEX IF NOT EXISTS idx_lesson_versions_lesson_id ON lesson_versions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_lesson_id ON quiz_attempts(lesson_id);
CREATE INDEX IF NOT EXISTS idx_cards_course_id ON cards(course_id);
CREATE INDEX IF NOT EXISTS idx_cards_lesson_id ON cards(lesson_id);
CREATE INDEX IF NOT EXISTS idx_cards_due_at ON cards(due_at);
CREATE INDEX IF NOT EXISTS idx_reviews_card_id ON reviews(card_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_lesson_id ON chat_messages(lesson_id);
CREATE INDEX IF NOT EXISTS idx_reflections_lesson_id ON reflections(lesson_id);
CREATE INDEX IF NOT EXISTS idx_notes_course_id ON notes(course_id);
CREATE INDEX IF NOT EXISTS idx_notes_lesson_id ON notes(lesson_id);
CREATE INDEX IF NOT EXISTS idx_activity_day ON activity(day);
CREATE INDEX IF NOT EXISTS idx_activity_kind ON activity(kind);

-- Phase 29 groundwork: in-course code workspace (programming courses).
CREATE TABLE IF NOT EXISTS workspace_files (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  course_id TEXT,
  lesson_id TEXT NOT NULL,
  path TEXT NOT NULL,
  language TEXT,
  content TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS run_results (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  lesson_id TEXT NOT NULL,
  file_id TEXT,
  runner TEXT,
  language TEXT,
  stdout TEXT,
  stderr TEXT,
  exit_code INTEGER,
  checks_json TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_workspace_files_lesson_id ON workspace_files(lesson_id);
CREATE INDEX IF NOT EXISTS idx_run_results_lesson_id ON run_results(lesson_id);
