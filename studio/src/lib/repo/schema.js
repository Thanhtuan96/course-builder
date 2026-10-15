/**
 * JS metadata mirroring migrations/0001_init.sql.
 *
 * The IndexedDB adapter creates one object store per table and one index per entry in
 * `indexes`. Adapters only guarantee equality filtering on these fields (see StorageAdapter
 * contract in remote-adapter.js) — richer queries live in repo/index.js so the SQLite/D1
 * adapters stay generic.
 *
 * `fields` lists every column (documentation / the SQLite side); `indexes` are the only fields
 * an adapter may use in `list({ where })`. `quiz_seed` is a demo-only convenience column
 * (pre-written quiz so the bundled demo course is walkable with no provider).
 */

/** @typedef {{ id: string, fields: string[], indexes: string[] }} TableSpec */

/** @type {Record<string, TableSpec>} */
export const TABLES = {
  courses: {
    id: 'id',
    fields: ['id', 'owner_id', 'title', 'description', 'level', 'kind', 'goal', 'topics_json', 'source', 'status', 'external_id', 'created_at', 'updated_at', 'deleted_at'],
    indexes: ['external_id'],
  },
  lessons: {
    id: 'id',
    fields: ['id', 'owner_id', 'course_id', 'position', 'title', 'summary', 'status', 'completed_at', 'current_version_id', 'quiz_seed', 'external_id', 'created_at', 'updated_at', 'deleted_at'],
    indexes: ['course_id', 'status', 'external_id'],
  },
  lesson_versions: {
    id: 'id',
    fields: ['id', 'owner_id', 'lesson_id', 'version', 'content_md', 'model', 'provider', 'external_id', 'created_at', 'updated_at', 'deleted_at'],
    indexes: ['lesson_id', 'external_id'],
  },
  quiz_attempts: {
    id: 'id',
    fields: ['id', 'owner_id', 'lesson_id', 'questions_json', 'answers_json', 'score', 'total', 'created_at', 'updated_at', 'deleted_at'],
    indexes: ['lesson_id'],
  },
  cards: {
    id: 'id',
    fields: ['id', 'owner_id', 'course_id', 'lesson_id', 'front', 'back', 'ease', 'interval_days', 'reps', 'lapses', 'due_at', 'external_id', 'created_at', 'updated_at', 'deleted_at'],
    indexes: ['course_id', 'lesson_id', 'due_at', 'external_id'],
  },
  reviews: {
    id: 'id',
    fields: ['id', 'owner_id', 'card_id', 'grade', 'reviewed_at', 'created_at', 'updated_at', 'deleted_at'],
    indexes: ['card_id'],
  },
  chat_messages: {
    id: 'id',
    fields: ['id', 'owner_id', 'lesson_id', 'role', 'content', 'mode', 'created_at', 'updated_at', 'deleted_at'],
    indexes: ['lesson_id'],
  },
  reflections: {
    id: 'id',
    fields: ['id', 'owner_id', 'lesson_id', 'hardest', 'confidence', 'note', 'created_at', 'updated_at', 'deleted_at'],
    indexes: ['lesson_id'],
  },
  notes: {
    id: 'id',
    fields: ['id', 'owner_id', 'course_id', 'lesson_id', 'content_md', 'created_at', 'updated_at', 'deleted_at'],
    indexes: ['course_id', 'lesson_id'],
  },
  activity: {
    id: 'id',
    fields: ['id', 'owner_id', 'day', 'kind', 'ref_id', 'created_at', 'updated_at', 'deleted_at'],
    indexes: ['day', 'kind'],
  },
  workspace_files: {
    id: 'id',
    fields: ['id', 'owner_id', 'course_id', 'lesson_id', 'path', 'language', 'content', 'created_at', 'updated_at', 'deleted_at'],
    indexes: ['lesson_id'],
  },
  run_results: {
    id: 'id',
    fields: ['id', 'owner_id', 'lesson_id', 'file_id', 'runner', 'language', 'stdout', 'stderr', 'exit_code', 'checks_json', 'duration_ms', 'created_at', 'updated_at', 'deleted_at'],
    indexes: ['lesson_id'],
  },
};

export const TABLE_NAMES = Object.keys(TABLES);

export const SCHEMA_VERSION = 1;

/**
 * @param {string} table
 * @returns {TableSpec}
 */
export function tableSpec(table) {
  const spec = TABLES[table];
  if (!spec) throw new Error(`Unknown table: ${table}`);
  return spec;
}

/**
 * Throw unless `field` is an equality-filterable (indexed) field of `table`.
 * @param {string} table
 * @param {string} field
 */
export function assertIndexedField(table, field) {
  const spec = tableSpec(table);
  if (field === spec.id) return;
  if (!spec.indexes.includes(field)) {
    throw new Error(`Field "${field}" is not indexed on table "${table}"`);
  }
}
