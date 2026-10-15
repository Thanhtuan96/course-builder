/**
 * Repository — the ONLY data API pages use.
 *
 * All business logic lives here. Adapters (idb / memory / remote) are dumb table-level stores;
 * this module owns ids, `owner_id`, `created_at`/`updated_at`/`deleted_at` tombstones, ordering,
 * cascades and derived views. Swapping to the SQLite server (Phase 26) is one `useAdapter()` call.
 */
import { createIdbAdapter } from './idb-adapter.js';
import { review as srsReview, newCardState } from '../srs.js';
import { dayKey } from '../course.js';

let adapter = createIdbAdapter();
const changes = new EventTarget();

/* ------------------------------------------------------------------ helpers */

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {string} table
 * @param {string|null} id
 * @param {string} type
 */
function emit(table, id, type) {
  changes.dispatchEvent(new CustomEvent('change', { detail: { table, id, type } }));
}

/**
 * Subscribe to repository writes.
 * @param {(detail: { table: string, id: string|null, type: string }) => void} handler
 * @returns {() => void} unsubscribe
 */
export function onChange(handler) {
  const listener = (e) => handler(e.detail);
  changes.addEventListener('change', listener);
  return () => changes.removeEventListener('change', listener);
}

/** @param {import('./remote-adapter.js').StorageAdapter} next */
export function useAdapter(next) {
  adapter = next;
  emit('adapter', null, 'use');
  return adapter;
}

/** @returns {Promise<{ kind: 'indexeddb'|'memory'|'remote', persistent: boolean }>} */
export function getAdapterInfo() {
  return adapter.info();
}

function stampCreate(row, now = nowIso()) {
  return {
    ...row,
    id: row.id || uuid(),
    owner_id: row.owner_id || 'local',
    created_at: row.created_at || now,
    updated_at: now,
    deleted_at: row.deleted_at ?? null,
  };
}

function stampUpdate(prev, patch) {
  const now = nowIso();
  return {
    ...prev,
    ...patch,
    owner_id: patch.owner_id ?? prev?.owner_id ?? 'local',
    created_at: prev?.created_at ?? patch.created_at ?? now,
    updated_at: now,
    deleted_at: patch.deleted_at ?? prev?.deleted_at ?? null,
  };
}

function mergeAllowed(prev, patch, allowed) {
  const out = { ...prev };
  for (const key of allowed) if (patch[key] !== undefined) out[key] = patch[key];
  return out;
}

/* ------------------------------------------------------------------ courses */

/** @returns {Promise<object[]>} */
export async function listCourses() {
  return adapter.list('courses', { orderBy: { field: 'updated_at', dir: 'desc' } });
}

/**
 * @param {string} id
 * @returns {Promise<(object & { lessons: object[] }) | null>}
 */
export async function getCourse(id) {
  const course = await adapter.get('courses', id);
  if (!course || course.deleted_at) return null;
  const lessons = await adapter.list('lessons', {
    where: { course_id: id },
    orderBy: { field: 'position', dir: 'asc' },
  });
  return { ...course, lessons };
}

/**
 * @param {object} input
 * @param {string} input.title
 * @param {Array<object|string>} [input.lessons]
 * @returns {Promise<object & { lessons: object[] }>}
 */
export async function createCourse(input = {}) {
  const now = nowIso();
  const course = stampCreate(
    {
      id: input.id,
      title: input.title || 'Untitled course',
      description: input.description || '',
      level: input.level || 'Beginner',
      kind: input.kind || 'conceptual',
      goal: input.goal || '',
      topics_json: JSON.stringify(input.topics || []),
      source: input.source || 'ai',
      status: input.status || 'active',
    },
    now
  );
  await adapter.put('courses', course);

  const lessons = [];
  const inputLessons = input.lessons || [];
  for (let i = 0; i < inputLessons.length; i++) {
    const raw = typeof inputLessons[i] === 'string' ? { title: inputLessons[i] } : inputLessons[i];
    let lesson = stampCreate(
      {
        id: raw.id,
        course_id: course.id,
        position: i + 1,
        title: raw.title || `Lesson ${i + 1}`,
        summary: raw.summary || '',
        status: raw.status || 'todo',
        completed_at: raw.completed_at || null,
        current_version_id: null,
        quiz_seed: raw.quiz_seed ? JSON.stringify(raw.quiz_seed) : null,
      },
      now
    );
    await adapter.put('lessons', lesson);
    if (raw.content_md) {
      const version = await addLessonVersion(lesson.id, {
        content_md: raw.content_md,
        model: raw.model || 'demo',
        provider: raw.provider || 'demo',
      });
      lesson = { ...lesson, current_version_id: version.id };
    }
    lessons.push(lesson);
  }

  emit('courses', course.id, 'create');
  return { ...course, lessons };
}

/**
 * @param {string} id
 * @param {{ title?: string, description?: string, level?: string, goal?: string, status?: string, topics?: string[] }} patch
 */
export async function updateCourse(id, patch = {}) {
  const prev = await adapter.get('courses', id);
  if (!prev) return null;
  const merged = mergeAllowed(prev, patch, ['title', 'description', 'level', 'goal', 'status', 'source']);
  if (patch.topics !== undefined) merged.topics_json = JSON.stringify(patch.topics);
  const next = stampUpdate(prev, merged);
  await adapter.put('courses', next);
  emit('courses', id, 'update');
  return next;
}

/** Soft-delete a course and cascade its lessons, cards and notes. */
export async function deleteCourse(id) {
  const course = await adapter.get('courses', id);
  if (!course) return null;
  await adapter.softDelete('courses', id);
  for (const table of ['lessons', 'cards', 'notes']) {
    const rows = await adapter.list(table, { where: { course_id: id } });
    for (const row of rows) await adapter.softDelete(table, row.id);
  }
  emit('courses', id, 'delete');
  return { ...course, deleted_at: nowIso() };
}

/* ------------------------------------------------------------------ lessons */

/** @param {string} id */
export async function getLesson(id) {
  const lesson = await adapter.get('lessons', id);
  return lesson && !lesson.deleted_at ? lesson : null;
}

/**
 * @param {string} id
 * @param {{ title?: string, summary?: string, status?: string, completed_at?: string, position?: number, quiz_seed?: any }} patch
 */
export async function updateLesson(id, patch = {}) {
  const prev = await adapter.get('lessons', id);
  if (!prev) return null;
  const merged = mergeAllowed(prev, patch, [
    'title',
    'summary',
    'status',
    'completed_at',
    'position',
    'current_version_id',
  ]);
  if (patch.quiz_seed !== undefined) {
    merged.quiz_seed = typeof patch.quiz_seed === 'string' ? patch.quiz_seed : JSON.stringify(patch.quiz_seed);
  }
  const next = stampUpdate(prev, merged);
  if (merged.status === 'done' && !next.completed_at) next.completed_at = nowIso();
  await adapter.put('lessons', next);
  emit('lessons', id, 'update');
  return next;
}

/* ------------------------------------------------------------------ versions */

/**
 * Append a new immutable version. Regenerating a lesson ADDS a row, never overwrites.
 * @param {string} lessonId
 * @param {{ content_md?: string, model?: string, provider?: string }} data
 * @returns {Promise<object>} the new version row
 */
export async function addLessonVersion(lessonId, { content_md = '', model = null, provider = null } = {}) {
  const lesson = await adapter.get('lessons', lessonId);
  if (!lesson || lesson.deleted_at) throw new Error(`Lesson not found: ${lessonId}`);
  const existing = await adapter.list('lesson_versions', { where: { lesson_id: lessonId } });
  const version = existing.reduce((max, v) => Math.max(max, v.version || 0), 0) + 1;
  const row = stampCreate({ lesson_id: lessonId, version, content_md, model, provider });
  await adapter.put('lesson_versions', row);
  await adapter.put('lessons', stampUpdate(lesson, { current_version_id: row.id }));
  emit('lesson_versions', row.id, 'create');
  return row;
}

/** @param {string} lessonId */
export async function listLessonVersions(lessonId) {
  return adapter.list('lesson_versions', {
    where: { lesson_id: lessonId },
    orderBy: { field: 'version', dir: 'asc' },
  });
}

/**
 * Current version row for a lesson (falls back to the highest version number).
 * @param {string} lessonId
 * @returns {Promise<object|null>}
 */
export async function getLessonContent(lessonId) {
  const lesson = await adapter.get('lessons', lessonId);
  if (!lesson) return null;
  if (lesson.current_version_id) {
    const row = await adapter.get('lesson_versions', lesson.current_version_id);
    if (row && !row.deleted_at) return row;
  }
  const rows = await adapter.list('lesson_versions', {
    where: { lesson_id: lessonId },
    orderBy: { field: 'version', dir: 'desc' },
    limit: 1,
  });
  return rows[0] || null;
}

/* ------------------------------------------------------------------ practice */

/**
 * @param {string} lessonId
 * @param {{ questions?: any[], answers?: any[], score?: number, total?: number }} data
 */
export async function saveQuizAttempt(lessonId, { questions = [], answers = [], score = null, total = null } = {}) {
  const row = stampCreate({
    lesson_id: lessonId,
    questions_json: JSON.stringify(questions),
    answers_json: JSON.stringify(answers),
    score,
    total,
  });
  await adapter.put('quiz_attempts', row);
  emit('quiz_attempts', row.id, 'create');
  return row;
}

/** @param {string} lessonId */
export async function listQuizAttempts(lessonId) {
  return adapter.list('quiz_attempts', {
    where: { lesson_id: lessonId },
    orderBy: { field: 'created_at', dir: 'asc' },
  });
}

/**
 * @param {string|null} courseId
 * @param {string|null} lessonId
 * @param {Array<{ front: string, back: string }>} cards
 */
export async function addCards(courseId, lessonId, cards = []) {
  const now = nowIso();
  const state = newCardState();
  const rows = cards.map((c) =>
    stampCreate(
      {
        course_id: courseId || null,
        lesson_id: lessonId || null,
        front: c.front,
        back: c.back,
        ease: state.ease,
        interval_days: state.interval,
        reps: state.reps,
        lapses: state.lapses,
        due_at: new Date(state.due).toISOString(),
      },
      now
    )
  );
  await adapter.putMany('cards', rows);
  emit('cards', null, 'create');
  return rows;
}

/**
 * Cards across every course (optionally scoped), soonest due first. Soft-deleted rows are omitted
 * by the adapter (HANDOFF-24 §1).
 * @param {{ courseId?: string|null, lessonId?: string|null }} [q]
 */
export async function listCards({ courseId, lessonId } = {}) {
  const where = {};
  if (courseId) where.course_id = courseId;
  if (lessonId) where.lesson_id = lessonId;
  return adapter.list('cards', { where, orderBy: { field: 'due_at', dir: 'asc' } });
}

/**
 * Due cards across every course, soonest first.
 * @param {number|string} [now]
 */
export async function listDueCards(now = Date.now()) {
  const at = typeof now === 'number' ? now : Date.parse(now);
  const cards = await adapter.list('cards', { orderBy: { field: 'due_at', dir: 'asc' } });
  return cards.filter((c) => {
    const due = Date.parse(c.due_at);
    return Number.isNaN(due) || due <= at;
  });
}

/**
 * Grade a card with SM-2 and record the review.
 * @param {string} cardId
 * @param {number} grade 0 again | 1 hard | 2 good | 3 easy
 */
export async function gradeCard(cardId, grade) {
  const card = await adapter.get('cards', cardId);
  if (!card) throw new Error(`Card not found: ${cardId}`);
  const nextState = srsReview(
    {
      ease: card.ease,
      interval: card.interval_days,
      reps: card.reps,
      lapses: card.lapses,
      due: Date.parse(card.due_at),
    },
    grade
  );
  const next = stampUpdate(card, {
    ease: nextState.ease,
    interval_days: nextState.interval,
    reps: nextState.reps,
    lapses: nextState.lapses,
    due_at: new Date(nextState.due).toISOString(),
  });
  await adapter.put('cards', next);
  const review = stampCreate({ card_id: cardId, grade, reviewed_at: nowIso() });
  await adapter.put('reviews', review);
  emit('cards', cardId, 'grade');
  return { card: next, review };
}

/* ------------------------------------------------------------------ tutor chat */

/**
 * @param {string} lessonId
 * @param {{ role: string, content: string, mode?: string }} msg
 */
export async function appendChat(lessonId, msg) {
  const row = stampCreate({ lesson_id: lessonId, role: msg.role, content: msg.content, mode: msg.mode || null });
  await adapter.put('chat_messages', row);
  emit('chat_messages', row.id, 'create');
  return row;
}

/** @param {string} lessonId */
export async function listChat(lessonId) {
  return adapter.list('chat_messages', {
    where: { lesson_id: lessonId },
    orderBy: { field: 'created_at', dir: 'asc' },
  });
}

/* ------------------------------------------------------------------ reflection & notes */

/**
 * @param {string} lessonId
 * @param {{ hardest?: string, confidence?: number, note?: string }} data
 */
export async function saveReflection(lessonId, data = {}) {
  const row = stampCreate({
    lesson_id: lessonId,
    hardest: data.hardest || '',
    confidence: data.confidence ?? null,
    note: data.note || '',
  });
  await adapter.put('reflections', row);
  emit('reflections', row.id, 'create');
  return row;
}

/** @param {{ courseId?: string|null, lessonId?: string|null, content_md?: string }} input */
export async function saveNote({ courseId = null, lessonId = null, content_md = '' } = {}) {
  const row = stampCreate({ course_id: courseId, lesson_id: lessonId, content_md });
  await adapter.put('notes', row);
  emit('notes', row.id, 'create');
  return row;
}

/** @param {{ courseId?: string, lessonId?: string }} [q] */
export async function listNotes({ courseId, lessonId } = {}) {
  const where = {};
  if (courseId) where.course_id = courseId;
  if (lessonId) where.lesson_id = lessonId;
  return adapter.list('notes', { where, orderBy: { field: 'created_at', dir: 'asc' } });
}

/**
 * Everything recorded for a lesson (DATA-03).
 * @param {string} lessonId
 */
export async function getLessonHistory(lessonId) {
  const [versions, attempts, chat, notes, reflections] = await Promise.all([
    listLessonVersions(lessonId),
    listQuizAttempts(lessonId),
    listChat(lessonId),
    adapter.list('notes', { where: { lesson_id: lessonId }, orderBy: { field: 'created_at', dir: 'asc' } }),
    adapter.list('reflections', { where: { lesson_id: lessonId }, orderBy: { field: 'created_at', dir: 'desc' } }),
  ]);
  return { versions, attempts, chat, notes, reflection: reflections[0] || null };
}

/* ------------------------------------------------------------------ code workspace (Phase 29 groundwork) */

/** @param {string} lessonId */
export async function listWorkspaceFiles(lessonId) {
  return adapter.list('workspace_files', { where: { lesson_id: lessonId }, orderBy: { field: 'path', dir: 'asc' } });
}

/**
 * Upsert a workspace file by (lesson_id, path). Versioning snapshots are Phase 29's job.
 * @param {{ courseId?: string|null, lessonId: string, path: string, language?: string|null, content?: string }} input
 */
export async function saveWorkspaceFile({ courseId = null, lessonId, path, language = null, content = '' }) {
  const existing = await adapter.list('workspace_files', { where: { lesson_id: lessonId } });
  const match = existing.find((f) => f.path === path);
  const row = match
    ? stampUpdate(match, { course_id: courseId ?? match.course_id, language, content })
    : stampCreate({ course_id: courseId, lesson_id: lessonId, path, language, content });
  await adapter.put('workspace_files', row);
  emit('workspace_files', row.id, match ? 'update' : 'create');
  return row;
}

/**
 * Soft-delete a workspace file by (lesson_id, path). The tombstone keeps the row (and its run
 * history) while `listWorkspaceFiles` hides it — replaces the DELETED_MARKER workaround.
 * @param {{ lessonId: string, path: string }} input
 * @returns {Promise<object|null>} the tombstoned row, or null when there was no such file
 */
export async function deleteWorkspaceFile({ lessonId, path }) {
  const rows = await adapter.list('workspace_files', { where: { lesson_id: lessonId } });
  const match = rows.find((f) => f.path === path);
  if (!match) return null;
  await adapter.softDelete('workspace_files', match.id);
  emit('workspace_files', match.id, 'delete');
  return { ...match, deleted_at: nowIso() };
}

/**
 * @param {{ lessonId: string, fileId?: string|null, runner?: 'browser'|'local', language?: string|null, stdout?: string, stderr?: string, exitCode?: number|null, checks?: any, durationMs?: number|null }} input
 */
export async function saveRunResult({
  lessonId,
  fileId = null,
  runner = 'browser',
  language = null,
  stdout = '',
  stderr = '',
  exitCode = null,
  checks = null,
  durationMs = null,
}) {
  const row = stampCreate({
    lesson_id: lessonId,
    file_id: fileId,
    runner,
    language,
    stdout,
    stderr,
    exit_code: exitCode,
    checks_json: checks === null ? null : JSON.stringify(checks),
    duration_ms: durationMs,
  });
  await adapter.put('run_results', row);
  emit('run_results', row.id, 'create');
  return row;
}

/** @param {string} lessonId */
export async function listRunResults(lessonId) {
  return adapter.list('run_results', {
    where: { lesson_id: lessonId },
    orderBy: { field: 'created_at', dir: 'asc' },
  });
}

/* ------------------------------------------------------------------ activity */

/** @param {string} kind @param {string|null} [refId] */
export async function logActivity(kind, refId = null) {
  const row = stampCreate({ day: dayKey(new Date()), kind, ref_id: refId });
  await adapter.put('activity', row);
  emit('activity', row.id, 'create');
  return row;
}

export async function listActivity() {
  return adapter.list('activity', { orderBy: { field: 'created_at', dir: 'asc' } });
}

/* ------------------------------------------------------------------ portability */

/** Full backup — settings/API keys never live in the repository, so they are never exported. */
export async function exportAll() {
  return adapter.exportAll();
}

/** @param {object} dump */
export async function importAll(dump) {
  const result = await adapter.importAll(dump);
  emit('*', null, 'import');
  return result;
}
