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
import { normalizeLanguage } from '../i18n/languages.js';
import {
  buildEventRow,
  buildRevisionLink,
  checksList,
  compactMeta,
  REVISION_FEEDBACK_TABLES,
  validateEventKind,
  validateEventSurface,
  validateMeta,
} from './events.js';

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

/* -------------------------------------------------- best-effort side effects */

/**
 * Run a post-write side effect (event emission, revision link) without letting its failure reject
 * the learner's action (D-16). Swallows once — no retry — and logs only in dev (D-17).
 * @template T
 * @param {string} label
 * @param {() => Promise<T>} run
 * @returns {Promise<T|null>}
 */
async function bestEffort(label, run) {
  try {
    return await run();
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('[repo] ' + label + ' failed', err);
    return null;
  }
}

/**
 * Best-effort `recordEvent`. Validation inside `recordEvent` still throws — this only tolerates the
 * failure at the call site, after the primary row is written (D-16/D-17).
 * @param {string} label
 * @param {object} input
 * @returns {Promise<object|null>}
 */
function safeRecordEvent(label, input) {
  return bestEffort(label, () => recordEvent(input));
}

/**
 * Best-effort `maybeLinkRevision`. Like `safeRecordEvent`, the write failure is swallowed once.
 * @param {string} label
 * @param {object} input
 * @returns {Promise<object|null>}
 */
function safeMaybeLinkRevision(label, input) {
  return bestEffort(label, () => maybeLinkRevision(input));
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

/* ------------------------------------------------------------------ revision helpers */

const REVISION_WINDOW_MS = 72 * 60 * 60 * 1000;
const TUTOR_ATTEMPT_MODES = Object.freeze(['check_answer', 'review']);

function toIsoTimestamp(now) {
  if (now === undefined || now === null) return nowIso();
  return (now instanceof Date ? now : new Date(now)).toISOString();
}

function createdAtMs(row) {
  const value = Date.parse(row?.created_at);
  return Number.isNaN(value) ? null : value;
}

function sortByCreatedAt(rows, tiebreak = 'id') {
  return [...rows].sort((a, b) => {
    const aTime = createdAtMs(a);
    const bTime = createdAtMs(b);
    if (aTime !== bTime) return aTime - bTime;
    const aKey = String(a?.[tiebreak] ?? '');
    const bKey = String(b?.[tiebreak] ?? '');
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
}

function latestPriorAttempt(rows, attemptRow, tiebreak = 'id') {
  const newTime = createdAtMs(attemptRow);
  if (newTime == null) return null;
  const candidates = rows.filter((row) => row.id !== attemptRow.id && createdAtMs(row) != null && createdAtMs(row) <= newTime);
  if (candidates.length === 0) return null;
  const sorted = sortByCreatedAt(candidates, tiebreak);
  return sorted[sorted.length - 1];
}

function runChecks(row) {
  return checksList(parseJsonColumn(row?.checks_json, null));
}

function hasFailingCheck(row) {
  return runChecks(row).some((check) => check?.passed === false || check?.ok === false);
}

async function revisionCourseId({ lessonId = null, capstoneId = null } = {}) {
  if (capstoneId) {
    const capstone = await adapter.get('capstones', capstoneId);
    return capstone?.course_id ?? null;
  }
  if (lessonId) {
    const lesson = await adapter.get('lessons', lessonId);
    return lesson?.course_id ?? null;
  }
  return null;
}

async function findPriorAttempt({ surface, attemptRow, lessonId = null, capstoneId = null }) {
  if (surface === 'quiz') {
    const rows = await adapter.list('quiz_attempts', { where: { lesson_id: lessonId } });
    return latestPriorAttempt(rows, attemptRow);
  }
  if (surface === 'tutor') {
    const rows = await adapter.list('chat_messages', { where: { lesson_id: lessonId } });
    const attempts = rows.filter((row) => row.role === 'user' && TUTOR_ATTEMPT_MODES.includes(row.mode));
    return latestPriorAttempt(attempts, attemptRow);
  }
  if (surface === 'workspace') {
    const rows = await adapter.list('run_results', { where: { lesson_id: lessonId } });
    const sameFile = rows.filter(
      (row) => (row.file_id ?? null) === (attemptRow.file_id ?? null) && hasFailingCheck(row)
    );
    return latestPriorAttempt(sameFile, attemptRow);
  }
  if (surface === 'capstone') {
    const rows = await adapter.list('capstone_submissions', { where: { capstone_id: capstoneId } });
    const reviewed = rows.filter((row) => row.review_json != null || row.verdict != null);
    return latestPriorAttempt(reviewed, attemptRow, 'attempt');
  }
  return null;
}

/** Load a caller-supplied feedback row only through the fixed allowlist (T-05-08). */
async function loadExplicitFeedback(revisionOf) {
  if (!revisionOf || typeof revisionOf !== 'object') return null;
  const { feedbackTable, feedbackId } = revisionOf;
  if (!feedbackTable || !feedbackId) return null;
  if (!REVISION_FEEDBACK_TABLES.includes(feedbackTable)) return null;
  const row = await adapter.get(feedbackTable, feedbackId);
  if (!row || row.deleted_at) return null;
  return { table: feedbackTable, id: feedbackId, row };
}

function latestByCreatedAt(rows, tiebreak = 'id') {
  const valid = rows.filter((row) => createdAtMs(row) != null);
  if (valid.length === 0) return null;
  const sorted = sortByCreatedAt(valid, tiebreak);
  return sorted[sorted.length - 1];
}

/**
 * Resolve the D-07 feedback row for one surface. Workspace and capstone are their own feedback.
 * @param {{ surface: string, attemptRow: object, prior: object|null, lessonId?: string|null }} input
 */
async function findInferenceFeedback({ surface, attemptRow, prior, lessonId = null }) {
  if (surface === 'workspace' || surface === 'capstone') return prior;
  if (surface !== 'quiz' && surface !== 'tutor') return null;
  const priorTime = createdAtMs(prior);
  const newTime = createdAtMs(attemptRow);
  if (priorTime == null || newTime == null) return null;
  const rows = await adapter.list('chat_messages', { where: { lesson_id: lessonId } });
  const candidates = rows.filter((row) => {
    if (row.role !== 'assistant') return false;
    if (surface === 'quiz' && row.mode !== 'review') return false;
    const at = createdAtMs(row);
    return at != null && at > priorTime && at <= newTime;
  });
  return latestByCreatedAt(candidates);
}

/**
 * Write at most one revision link for a just-created attempt row (D-06/D-07).
 * @param {{ surface: string, attemptTable: string, attemptRow: object, lessonId?: string|null, capstoneId?: string|null, revisionOf?: object|null, now?: Date|string }} input
 */
async function maybeLinkRevision({
  surface,
  attemptTable,
  attemptRow,
  lessonId = null,
  capstoneId = null,
  revisionOf = null,
  now,
}) {
  const existing = await adapter.list('revision_links', { where: { revised_id: attemptRow.id } });
  if (existing.length > 0) return existing[0];

  const courseId = await revisionCourseId({ lessonId, capstoneId });
  const prior = await findPriorAttempt({ surface, attemptRow, lessonId, capstoneId });
  const explicit = await loadExplicitFeedback(revisionOf);
  if (explicit) {
    const row = stampCreate(
      buildRevisionLink({
        surface,
        courseId,
        lessonId,
        attemptTable,
        attemptId: prior?.id ?? null,
        feedbackTable: explicit.table,
        feedbackId: explicit.id,
        revisedTable: attemptTable,
        revisedId: attemptRow.id,
        linkKind: 'explicit',
      }),
      toIsoTimestamp(now)
    );
    await adapter.put('revision_links', row);
    return row;
  }

  const feedback = await findInferenceFeedback({ surface, attemptRow, prior, lessonId });
  if (!prior || !feedback) return null;

  const priorTime = createdAtMs(prior);
  const newTime = createdAtMs(attemptRow);
  if (priorTime == null || newTime == null) return null;
  const span = newTime - priorTime;
  if (span < 0 || span > REVISION_WINDOW_MS) return null;

  const feedbackTable =
    surface === 'workspace' ? 'run_results' : surface === 'capstone' ? 'capstone_submissions' : 'chat_messages';
  const row = stampCreate(
    buildRevisionLink({
      surface,
      courseId,
      lessonId,
      attemptTable,
      attemptId: prior.id,
      feedbackTable,
      feedbackId: feedback.id,
      revisedTable: attemptTable,
      revisedId: attemptRow.id,
      linkKind: 'inferred',
    }),
    toIsoTimestamp(now)
  );
  await adapter.put('revision_links', row);
  return row;
}

/* ------------------------------------------------------------------ courses */

/**
 * Migrate a stored course row's legacy `language` display name to a BCP-47 code on READ (LANG-01).
 * Writes keep whatever the caller supplied, so the raw row stays byte-identical for backups.
 * @param {object|null} row
 */
export function decodeCourse(row) {
  if (!row) return row;
  if (row.language === null || row.language === undefined) return row;
  return { ...row, language: normalizeLanguage(row.language) };
}

/** @returns {Promise<object[]>} */
export async function listCourses() {
  const rows = await adapter.list('courses', { orderBy: { field: 'updated_at', dir: 'desc' } });
  return rows.map(decodeCourse);
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
  return { ...decodeCourse(course), lessons };
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
      language: input.language || null,
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
 * @param {{ title?: string, description?: string, level?: string, goal?: string, status?: string, language?: string|null, topics?: string[] }} patch
 */
export async function updateCourse(id, patch = {}) {
  const prev = await adapter.get('courses', id);
  if (!prev) return null;
  const merged = mergeAllowed(prev, patch, ['title', 'description', 'level', 'goal', 'status', 'source', 'language']);
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
export async function addLessonVersion(lessonId, { content_md = '', model = null, provider = null, language = null } = {}) {
  const lesson = await adapter.get('lessons', lessonId);
  if (!lesson || lesson.deleted_at) throw new Error(`Lesson not found: ${lessonId}`);
  const existing = await adapter.list('lesson_versions', { where: { lesson_id: lessonId } });
  const version = existing.reduce((max, v) => Math.max(max, v.version || 0), 0) + 1;
  const row = stampCreate({ lesson_id: lessonId, version, content_md, model, provider, language });
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
 * @param {{ questions?: any[], answers?: any[], score?: number, total?: number, revisionOf?: object|null }} data
 */
export async function saveQuizAttempt(
  lessonId,
  { questions = [], answers = [], score = null, total = null, revisionOf = null } = {}
) {
  const row = stampCreate({
    lesson_id: lessonId,
    questions_json: JSON.stringify(questions),
    answers_json: JSON.stringify(answers),
    score,
    total,
  });
  await adapter.put('quiz_attempts', row);
  const lesson = lessonId ? await adapter.get('lessons', lessonId) : null;
  const meta = compactMeta({ total, score, answered: Array.isArray(answers) ? answers.length : 0 });
  await safeRecordEvent('quiz_completed event', {
    kind: 'quiz_completed',
    surface: 'quiz',
    courseId: lesson?.course_id ?? null,
    lessonId,
    refId: row.id,
    meta,
  });
  await safeMaybeLinkRevision('quiz revision link', {
    surface: 'quiz',
    attemptTable: 'quiz_attempts',
    attemptRow: row,
    lessonId,
    revisionOf,
  });
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
  await recordEvent({
    kind: 'recall_completed',
    surface: 'recall',
    courseId: card.course_id ?? null,
    lessonId: card.lesson_id ?? null,
    refId: review.id,
    meta: { grade },
  });
  emit('cards', cardId, 'grade');
  return { card: next, review };
}

/* ------------------------------------------------------------------ tutor chat */

/**
 * @param {string} lessonId
 * @param {{ role: string, content: string, mode?: string, revisionOf?: { feedbackTable: string, feedbackId: string }|null }} msg
 */
export async function appendChat(lessonId, msg) {
  const row = stampCreate({ lesson_id: lessonId, role: msg.role, content: msg.content, mode: msg.mode || null });
  await adapter.put('chat_messages', row);
  if (msg.role === 'user' && (msg.mode === 'check_answer' || msg.mode === 'review')) {
    const lesson = lessonId ? await adapter.get('lessons', lessonId) : null;
    await safeRecordEvent('answer_sent_for_review event', {
      kind: 'answer_sent_for_review',
      surface: 'tutor',
      courseId: lesson?.course_id ?? null,
      lessonId,
      refId: row.id,
      meta: { mode: msg.mode },
    });
    await safeMaybeLinkRevision('tutor revision link', {
      surface: 'tutor',
      attemptTable: 'chat_messages',
      attemptRow: row,
      lessonId,
      revisionOf: msg.revisionOf ?? null,
    });
  }
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
 * @param {{ lessonId: string, fileId?: string|null, runner?: 'browser'|'local', language?: string|null, stdout?: string, stderr?: string, exitCode?: number|null, checks?: any, durationMs?: number|null, revisionOf?: { feedbackTable: string, feedbackId: string }|null }} input
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
  revisionOf = null,
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
  const list = checksList(checks);
  const lesson = lessonId ? await adapter.get('lessons', lessonId) : null;
  const meta =
    list.length > 0
      ? {
          runner,
          checks_total: list.length,
          checks_passed: list.filter((c) => c?.passed === true || c?.ok === true).length,
        }
      : { runner, checks_total: list.length, ...(typeof exitCode === 'number' ? { exit_code: exitCode } : {}) };
  await safeRecordEvent('workspace run event', {
    kind: list.length > 0 ? 'exercise_completed' : 'workspace_run',
    surface: 'workspace',
    courseId: lesson?.course_id ?? null,
    lessonId,
    refId: row.id,
    meta,
  });
  await safeMaybeLinkRevision('workspace revision link', {
    surface: 'workspace',
    attemptTable: 'run_results',
    attemptRow: row,
    lessonId,
    revisionOf,
  });
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

/* ------------------------------------------------------------------ capstone (Phase 33) */

/** Parse a JSON TEXT column, falling back when it is absent or invalid. */
function parseJsonColumn(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

/**
 * Normalise a stored capstone row: JSON columns become live objects. Rows keep their raw
 * `*_json` columns too so backups stay byte-identical across adapters.
 * @param {object|null} row
 */
export function decodeCapstone(row) {
  if (!row) return null;
  return {
    ...row,
    rubric: parseJsonColumn(row.rubric_json, []),
    tests: parseJsonColumn(row.tests_json, null),
    hiddenAnswers: parseJsonColumn(row.hidden_answers_json, null),
    artifact: parseJsonColumn(row.artifact_json, null),
  };
}

/** @param {object|null} row */
export function decodeCapstoneSubmission(row) {
  if (!row) return null;
  return {
    ...row,
    files: parseJsonColumn(row.files_json, null),
    testResults: parseJsonColumn(row.test_results_json, null),
    review: parseJsonColumn(row.review_json, null),
  };
}

/**
 * The capstone for a course, or null. At most one exists — the brief is immutable.
 * @param {string} courseId
 * @returns {Promise<object|null>}
 */
export async function getCapstone(courseId) {
  const rows = await adapter.list('capstones', {
    where: { course_id: courseId },
    orderBy: { field: 'created_at', dir: 'asc' },
  });
  return decodeCapstone(rows[0] || null);
}

/**
 * Create the (immutable) capstone for a course. If one already exists it is returned unchanged —
 * there is deliberately no update API, so the learner always builds against the original brief.
 * @param {{ courseId: string, kind?: string, brief_md?: string, rubric?: any[], tests?: any, hiddenAnswers?: any, artifact?: any, externalId?: string|null }} input
 * @returns {Promise<object>}
 */
export async function createCapstone({
  courseId,
  kind = 'conceptual',
  brief_md = '',
  rubric = [],
  tests = null,
  hiddenAnswers = null,
  artifact = null,
  externalId = null,
} = {}) {
  if (!courseId) throw new Error('createCapstone needs a courseId');
  const existing = await getCapstone(courseId);
  if (existing) return existing;
  const row = stampCreate({
    course_id: courseId,
    kind,
    brief_md,
    rubric_json: JSON.stringify(Array.isArray(rubric) ? rubric : []),
    tests_json: tests == null ? null : JSON.stringify(tests),
    hidden_answers_json: hiddenAnswers == null ? null : JSON.stringify(hiddenAnswers),
    artifact_json: artifact == null ? null : JSON.stringify(artifact),
    external_id: externalId,
  });
  await adapter.put('capstones', row);
  emit('capstones', row.id, 'create');
  return decodeCapstone(row);
}

/**
 * Append a submission. Attempts are never overwritten: each call adds a new row with attempt =
 * max(existing) + 1. When `externalId` matches an existing row the existing one is returned
 * unchanged (idempotent CLI import).
 * @param {{ capstoneId: string, content_md?: string, repo_url?: string|null, files?: object|null, testResults?: any, review?: any, verdict?: string|null, externalId?: string|null, revisionOf?: { feedbackTable: string, feedbackId: string }|null }} input
 * @returns {Promise<object>}
 */
export async function createCapstoneSubmission({
  capstoneId,
  content_md = '',
  repo_url = null,
  files = null,
  testResults = null,
  review = null,
  verdict = null,
  externalId = null,
  revisionOf = null,
} = {}) {
  if (!capstoneId) throw new Error('createCapstoneSubmission needs a capstoneId');
  const existing = await adapter.list('capstone_submissions', { where: { capstone_id: capstoneId } });
  if (externalId) {
    const match = existing.find((s) => s.external_id === externalId);
    if (match) return decodeCapstoneSubmission(match);
  }
  const attempt = existing.reduce((max, s) => Math.max(max, s.attempt || 0), 0) + 1;
  const row = stampCreate({
    capstone_id: capstoneId,
    attempt,
    content_md,
    repo_url,
    files_json: files == null ? null : JSON.stringify(files),
    test_results_json: testResults == null ? null : JSON.stringify(testResults),
    review_json: review == null ? null : JSON.stringify(review),
    verdict,
    external_id: externalId,
  });
  await adapter.put('capstone_submissions', row);
  const capstone = await adapter.get('capstones', capstoneId);
  await safeRecordEvent('capstone checkpoint event', {
    kind: 'capstone_checkpoint',
    surface: 'capstone',
    courseId: capstone?.course_id ?? null,
    refId: row.id,
    meta: {
      source: testResults?.source === 'external' ? 'external' : 'in_app',
      attempt,
    },
  });
  await safeMaybeLinkRevision('capstone revision link', {
    surface: 'capstone',
    attemptTable: 'capstone_submissions',
    attemptRow: row,
    capstoneId,
    revisionOf,
  });
  emit('capstone_submissions', row.id, 'create');
  return decodeCapstoneSubmission(row);
}

/**
 * Every submission for a capstone, oldest attempt first.
 * @param {string} capstoneId
 */
export async function listCapstoneSubmissions(capstoneId) {
  const rows = await adapter.list('capstone_submissions', {
    where: { capstone_id: capstoneId },
    orderBy: { field: 'attempt', dir: 'asc' },
  });
  return rows.map(decodeCapstoneSubmission);
}

/** @param {string} capstoneId */
export async function getLatestCapstoneSubmission(capstoneId) {
  const list = await listCapstoneSubmissions(capstoneId);
  return list[list.length - 1] || null;
}

/**
 * Every workspace file for a course, across its lessons, keyed by path (later lessons win).
 * Used to snapshot the learner's code for a programming capstone submission (CAP-03).
 * @param {string} courseId
 * @returns {Promise<Array<{ path: string, content: string, language: string|null }>>}
 */
export async function listCourseWorkspaceFiles(courseId) {
  const lessons = await adapter.list('lessons', {
    where: { course_id: courseId },
    orderBy: { field: 'position', dir: 'asc' },
  });
  const byPath = new Map();
  for (const lesson of lessons) {
    const files = await adapter.list('workspace_files', {
      where: { lesson_id: lesson.id },
      orderBy: { field: 'path', dir: 'asc' },
    });
    for (const file of files) byPath.set(file.path, file);
  }
  return [...byPath.values()].map((f) => ({ path: f.path, content: f.content ?? '', language: f.language || null }));
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

/* ------------------------------------------------------------------ beta events */

/**
 * Create the singleton beta profile row without activating it (D-08).
 * @returns {Promise<object>}
 */
export async function getBetaProfile() {
  const existing = await adapter.get('beta_profile', 'local');
  if (existing) return existing;
  const row = stampCreate({ id: 'local', participant_id: uuid(), activated_at: null, activated_day: null });
  await adapter.put('beta_profile', row);
  return row;
}

/**
 * Activate the singleton profile on its first meaningful event, never rewriting it afterwards.
 * @param {object} event a stored `learning_events` row
 */
async function ensureBetaProfile(event) {
  const existing = await adapter.get('beta_profile', 'local');
  if (!existing) {
    return adapter.put(
      'beta_profile',
      stampCreate(
        { id: 'local', participant_id: uuid(), activated_at: event.created_at, activated_day: event.day },
        event.created_at
      )
    );
  }
  if (existing.activated_at == null) {
    return adapter.put(
      'beta_profile',
      stampUpdate(existing, { activated_at: event.created_at, activated_day: event.day })
    );
  }
  return existing;
}

/**
 * Record one meaningful learning event (D-01..D-05).
 * @param {{ kind: string, surface: string, courseId?: string|null, lessonId?: string|null, refId?: string|null, meta?: object, now?: Date|string }} input
 * @returns {Promise<object>} the stored event row
 */
export async function recordEvent({
  kind,
  surface,
  courseId = null,
  lessonId = null,
  refId = null,
  meta = {},
  now = new Date(),
} = {}) {
  validateEventKind(kind);
  validateEventSurface(kind, surface);
  const compact = compactMeta(meta);
  validateMeta(kind, compact);
  const at = now instanceof Date ? now : new Date(now);
  const row = buildEventRow({ kind, surface, courseId, lessonId, refId, meta: compact, now: at });
  const event = stampCreate(row, at.toISOString());
  await adapter.put('learning_events', event);
  await ensureBetaProfile(event);
  emit('learning_events', event.id, 'create');
  return event;
}

/**
 * List meaningful events, oldest first. Unknown filter keys are passed to the adapter so its
 * indexed-field guard rejects them (adapter parity, P4).
 * @param {{ kind?: string, day?: string, surface?: string, courseId?: string, lessonId?: string, includeDeleted?: boolean }} [query]
 * @returns {Promise<object[]>}
 */
export async function listEvents({ kind, day, surface, courseId, lessonId, includeDeleted, ...rest } = {}) {
  const where = {};
  if (kind != null) where.kind = kind;
  if (day != null) where.day = day;
  if (surface != null) where.surface = surface;
  if (courseId != null) where.course_id = courseId;
  if (lessonId != null) where.lesson_id = lessonId;
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) where[key] = value;
  }
  const opts = { where, orderBy: { field: 'created_at', dir: 'asc' } };
  if (includeDeleted !== undefined) opts.includeDeleted = includeDeleted;
  return adapter.list('learning_events', opts);
}

/**
 * Read revision links through indexed equality filters only (D-06, adapter parity).
 * Unknown filter keys are forwarded so `assertIndexedField` rejects them.
 * @param {{ surface?: string, courseId?: string, lessonId?: string, attemptId?: string, revisedId?: string, linkKind?: string, includeDeleted?: boolean }} [query]
 * @returns {Promise<object[]>}
 */
export async function listRevisionLinks({
  surface,
  courseId,
  lessonId,
  attemptId,
  revisedId,
  linkKind,
  includeDeleted,
  ...rest
} = {}) {
  const where = {};
  if (surface != null) where.surface = surface;
  if (courseId != null) where.course_id = courseId;
  if (lessonId != null) where.lesson_id = lessonId;
  if (attemptId != null) where.attempt_id = attemptId;
  if (revisedId != null) where.revised_id = revisedId;
  if (linkKind != null) where.link_kind = linkKind;
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) where[key] = value;
  }
  const opts = { where, orderBy: { field: 'created_at', dir: 'asc' } };
  if (includeDeleted !== undefined) opts.includeDeleted = includeDeleted;
  return adapter.list('revision_links', opts);
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
