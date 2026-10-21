/**
 * Pure event vocabulary and row builders (D-01/D-02/D-03/D-05).
 *
 * No adapter, repo or I/O lives here: the repository validates through these helpers and the
 * adapter only ever sees plain columns. Keeping the enum and the meta rules pure makes the
 * frozen Wave 2 contract testable without storage.
 */
import { dayKey } from '../course.js';

/** Closed meaningful-event enum, in the frozen D-01 order. */
export const EVENT_KINDS = Object.freeze([
  'quiz_completed',
  'recall_completed',
  'answer_sent_for_review',
  'workspace_run',
  'exercise_completed',
  'capstone_checkpoint',
]);

/** Grouping surfaces (D-03). `import` is reserved for non-meaningful import bookkeeping. */
export const EVENT_SURFACES = Object.freeze(['quiz', 'recall', 'tutor', 'workspace', 'capstone', 'import']);

/** The one legal surface per meaningful kind. */
export const KIND_SURFACE = Object.freeze({
  quiz_completed: 'quiz',
  recall_completed: 'recall',
  answer_sent_for_review: 'tutor',
  workspace_run: 'workspace',
  exercise_completed: 'workspace',
  capstone_checkpoint: 'capstone',
});

/** Closed allowlist of tables a revision may reference (D-06, T-05-08). */
export const REVISION_FEEDBACK_TABLES = Object.freeze([
  'chat_messages',
  'run_results',
  'capstone_submissions',
  'quiz_attempts',
]);

/** Frozen revision link kinds (D-06). */
export const REVISION_LINK_KINDS = Object.freeze(['explicit', 'inferred']);

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isRevisionLinkKind(value) {
  return REVISION_LINK_KINDS.includes(value);
}

/**
 * Throw before any adapter call when a caller-supplied table name is outside the allowlist.
 * @param {string} table
 * @returns {string}
 */
export function validateRevisionTable(table) {
  if (!REVISION_FEEDBACK_TABLES.includes(table)) {
    throw new Error(`Unknown revision table: ${table}`);
  }
  return table;
}

/**
 * Build the exact `revision_links` row columns (D-06).
 * @param {{ surface: string, courseId?: string|null, lessonId?: string|null, attemptTable?: string|null, attemptId?: string|null, feedbackTable: string, feedbackId: string, revisedTable: string, revisedId: string, linkKind: string }} input
 * @returns {object}
 */
export function buildRevisionLink({
  surface,
  courseId = null,
  lessonId = null,
  attemptTable = null,
  attemptId = null,
  feedbackTable,
  feedbackId,
  revisedTable,
  revisedId,
  linkKind,
} = {}) {
  if (!EVENT_SURFACES.includes(surface)) throw new Error(`Unknown revision surface: ${surface}`);
  if (!isRevisionLinkKind(linkKind)) throw new Error(`Unknown revision link kind: ${linkKind}`);
  validateRevisionTable(feedbackTable);
  validateRevisionTable(revisedTable);
  if (attemptTable != null) validateRevisionTable(attemptTable);
  return {
    surface,
    course_id: courseId ?? null,
    lesson_id: lessonId ?? null,
    attempt_table: attemptTable ?? null,
    attempt_id: attemptId ?? null,
    feedback_table: feedbackTable,
    feedback_id: feedbackId,
    revised_table: revisedTable,
    revised_id: revisedId,
    link_kind: linkKind,
  };
}

/**
 * @param {string} kind
 * @returns {string}
 */
export function validateEventKind(kind) {
  if (!EVENT_KINDS.includes(kind)) throw new Error(`Unknown event kind: ${kind}`);
  return kind;
}

/**
 * @param {string} kind
 * @param {string} surface
 * @returns {string}
 */
export function validateEventSurface(kind, surface) {
  validateEventKind(kind);
  if (!EVENT_SURFACES.includes(surface)) throw new Error(`Unknown event surface: ${surface}`);
  if (surface !== KIND_SURFACE[kind]) {
    throw new Error(`Event kind "${kind}" must use surface "${KIND_SURFACE[kind]}"`);
  }
  return surface;
}

/**
 * Unwrap the inner checks array. `CodeWorkspace` always sends `{ checks, snapshot }`, while CLI
 * imports and legacy rows may send a bare array (P1).
 * @param {any} checks
 * @returns {any[]}
 */
export function checksList(checks) {
  if (Array.isArray(checks)) return checks;
  if (checks && Array.isArray(checks.checks)) return checks.checks;
  return [];
}

const NUMBER = Object.freeze({ type: 'number' });

function enumSpec(values) {
  return Object.freeze({ type: 'enum', values: Object.freeze(values) });
}

/** Allowed meta keys and value shapes per kind (D-05). */
export const META_WHITELIST = Object.freeze({
  quiz_completed: Object.freeze({ total: NUMBER, score: NUMBER, answered: NUMBER }),
  recall_completed: Object.freeze({ grade: Object.freeze({ type: 'number', min: 0, max: 3 }) }),
  answer_sent_for_review: Object.freeze({ mode: enumSpec(['check_answer', 'review']) }),
  workspace_run: Object.freeze({
    runner: enumSpec(['browser', 'local']),
    checks_total: NUMBER,
    exit_code: NUMBER,
  }),
  exercise_completed: Object.freeze({
    runner: enumSpec(['browser', 'local']),
    checks_total: NUMBER,
    checks_passed: NUMBER,
  }),
  capstone_checkpoint: Object.freeze({
    source: enumSpec(['in_app', 'external']),
    attempt: NUMBER,
  }),
});

const META_MAX_LENGTH = 512;

/**
 * Drop null/undefined keys so optional scores and exit codes never reach validation.
 * @param {Record<string, any>|null|undefined} meta
 * @returns {Record<string, any>}
 */
export function compactMeta(meta = {}) {
  const out = {};
  for (const [key, value] of Object.entries(meta || {})) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Reject any meta that could carry learner content: unknown keys, non-finite numbers, arrays,
 * free strings, booleans and anything over the 512-character serialized cap (D-05/P8).
 * @param {string} kind
 * @param {Record<string, any>} meta already compacted by `compactMeta`
 * @returns {Record<string, any>}
 */
export function validateMeta(kind, meta = {}) {
  validateEventKind(kind);
  const whitelist = META_WHITELIST[kind];
  const serialized = JSON.stringify(meta ?? {});
  if (serialized.length > META_MAX_LENGTH) {
    throw new Error(`Event meta exceeds ${META_MAX_LENGTH} characters`);
  }
  for (const [key, value] of Object.entries(meta || {})) {
    if (!Object.prototype.hasOwnProperty.call(whitelist, key)) {
      throw new Error(`Unknown meta key "${key}" for event kind "${kind}"`);
    }
    const spec = whitelist[key];
    if (Array.isArray(value)) throw new Error(`Meta "${key}" must not be an array`);
    if (spec.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Meta "${key}" must be a finite number`);
      }
      if (spec.min !== undefined && value < spec.min) throw new Error(`Meta "${key}" is below ${spec.min}`);
      if (spec.max !== undefined && value > spec.max) throw new Error(`Meta "${key}" is above ${spec.max}`);
    } else if (spec.type === 'enum') {
      if (typeof value !== 'string' || !spec.values.includes(value)) {
        throw new Error(`Meta "${key}" must be one of: ${spec.values.join(', ')}`);
      }
    } else {
      throw new Error(`Meta "${key}" has an unsupported type`);
    }
  }
  return meta;
}

/**
 * @param {{ kind: string, surface: string, courseId?: string|null, lessonId?: string|null, refId?: string|null, meta?: object, now?: Date|string }} input
 * @returns {{ day: string, kind: string, surface: string, course_id: string|null, lesson_id: string|null, ref_id: string|null, meta_json: string }}
 */
export function buildEventRow({
  kind,
  surface,
  courseId = null,
  lessonId = null,
  refId = null,
  meta = {},
  now = new Date(),
} = {}) {
  validateEventSurface(kind, surface);
  const compact = compactMeta(meta);
  validateMeta(kind, compact);
  return {
    day: dayKey(now),
    kind,
    surface,
    course_id: courseId ?? null,
    lesson_id: lessonId ?? null,
    ref_id: refId ?? null,
    meta_json: JSON.stringify(compact),
  };
}
