/**
 * Pure revision-history layer (LOOP-02, LOOP-03).
 *
 * Everything here is React-free, repo-free and i18n-free so it can be unit-tested without a DOM:
 * review-record build/parse, the deterministic quiz/workspace criteria, the criteria delta, the
 * passing predicates and the one-shot revise intents. Fallback question copy is supplied by the
 * caller as a callback, which is what keeps this module i18n-free.
 *
 * `REVIEW_STATUSES` is imported from `prompts/practice.js` and re-exported: one definition site.
 */
import { REVIEW_STATUSES } from '../../lib/prompts/practice.js';
import { sanitizeRubricKey, sanitizeRubricLabel } from '../../lib/prompts/tutor.js';

export { REVIEW_STATUSES };

/** The three surfaces a review can judge. */
export const REVIEW_SURFACES = ['quiz', 'tutor', 'workspace'];

/* ------------------------------------------------------------------ review records */

/**
 * Build the record persisted in an assistant `chat_messages` row (`content` column).
 * `passing` is always derived, never supplied, so the stored record cannot contradict its criteria.
 * @param {{ surface: string, attemptTable: string, attemptId?: string|null,
 *   criteria?: object[] }} input
 * @returns {{ surface: string, attemptTable: string, attemptId: string|null,
 *   passing: boolean, criteria: object[] }}
 */
export function buildReviewRecord({ surface, attemptTable, attemptId = null, criteria = [] }) {
  const list = Array.isArray(criteria) ? criteria : [];
  return {
    surface,
    attemptTable,
    attemptId: attemptId ?? null,
    passing: reviewPassed(list),
    criteria: list,
  };
}

/**
 * Tolerant parse of a stored review record. Malformed JSON, a missing criteria array and invalid
 * criterion entries all collapse to `null`/dropped entries — never a throw (D-05/D-06,
 * Pitfall 6).
 *
 * Labels and keys are re-injected into a later system prompt, so a forged record is sanitized here
 * (T-08-06): tags, backticks, control characters and newlines cannot survive into the rubric block.
 *
 * `passing` is re-derived from the parsed criteria, never trusted from the stored JSON (T-08-11):
 * a forged `passing: true` over unmet criteria would otherwise hide the revise affordance.
 * @param {unknown} content the raw `chat_messages.content` value
 * @returns {{ surface: string, attemptTable: string, attemptId: string|null,
 *   passing: boolean, criteria: object[] }|null}
 */
export function parseReviewRecord(content) {
  if (typeof content !== 'string' || !content.trim()) return null;
  let raw;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.criteria) || !raw.criteria.length) {
    return null;
  }
  const criteria = raw.criteria
    .filter(
      (criterion) =>
        criterion &&
        typeof criterion.key === 'string' &&
        typeof criterion.label === 'string' &&
        REVIEW_STATUSES.includes(criterion.status)
    )
    .map((criterion) => {
      const key = sanitizeRubricKey(criterion.key);
      return {
        key,
        label: sanitizeRubricLabel(criterion.label) || key,
        status: criterion.status,
        question:
          typeof criterion.question === 'string' && criterion.question.trim()
            ? criterion.question
            : null,
      };
    })
    .filter((criterion) => criterion.key.length > 0);
  if (!criteria.length) return null;
  return {
    surface: typeof raw.surface === 'string' ? raw.surface : 'tutor',
    attemptTable: typeof raw.attemptTable === 'string' ? raw.attemptTable : 'chat_messages',
    attemptId: raw.attemptId ?? null,
    passing: reviewPassed(criteria),
    criteria,
  };
}

/**
 * Decode the JSON columns of a stored quiz attempt.
 * @param {{ questions_json?: string|null, answers_json?: string|null }|null|undefined} row
 * @returns {{ questions: any[], answers: any[] }}
 */
export function decodeQuizAttempt(row) {
  return {
    questions: parseArrayColumn(row?.questions_json),
    answers: parseArrayColumn(row?.answers_json),
  };
}

/** @param {unknown} raw @returns {any[]} */
function parseArrayColumn(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ deterministic criteria */

/**
 * Derive one criterion per quiz question from the stored answers — no provider required
 * (D-01/D-04).
 * Statuses are `met`/`not_met` only; partial is never produced for a multiple-choice question.
 * @param {{ questions?: object[], answers?: any[],
 *   questionText?: (criterion: object, index: number) => string }} input
 * @returns {Array<{ key: string, label: string, status: 'met'|'not_met', question: string|null }>}
 */
export function buildQuizReview({ questions = [], answers = [], questionText = () => '' } = {}) {
  const list = Array.isArray(questions) ? questions : [];
  const given = Array.isArray(answers) ? answers : [];
  return list.map((question, index) => {
    const met = given[index] === question?.answerIndex;
    const label = String(question?.question || `Q${index + 1}`).slice(0, 120);
    const criterion = {
      key: `q${index + 1}`,
      label,
      status: met ? 'met' : 'not_met',
      question: null,
    };
    return met ? criterion : { ...criterion, question: questionText(criterion, index) };
  });
}

/**
 * Slug one check name into a stable criterion key segment.
 * @param {unknown} name
 * @returns {string} lowercase `a-z0-9` words joined by single dashes, at most 40 characters
 */
export function slugifyCheckKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

/**
 * Derive one criterion per exercise self-check from the latest run — no provider required
 * (D-01/D-04). Only the check name and pass state are read; stdout/snapshot never leak.
 * @param {object[]} checks
 * @param {(criterion: object, index: number) => string} [questionText]
 * @returns {Array<{ key: string, label: string, status: 'met'|'not_met', question: string|null }>}
 */
export function workspaceCriteria(checks = [], questionText = () => '') {
  const used = new Set();
  return (Array.isArray(checks) ? checks : []).map((check, index) => {
    const base = slugifyCheckKey(check?.name) || `check${index + 1}`;
    let key = base;
    for (let suffix = 2; used.has(key); suffix += 1) key = `${base}-${suffix}`;
    used.add(key);
    const met = check?.passed === true || check?.ok === true;
    const label = String(check?.name || `Check ${index + 1}`).slice(0, 120);
    const criterion = { key, label, status: met ? 'met' : 'not_met', question: null };
    return met ? criterion : { ...criterion, question: questionText(criterion, index) };
  });
}

/* ------------------------------------------------------------------ summary and delta */

/**
 * Count the statuses of a criteria list.
 * @param {object[]} criteria
 * @returns {{ met: number, partial: number, notMet: number, total: number }}
 */
export function summarizeCriteria(criteria = []) {
  const list = Array.isArray(criteria) ? criteria : [];
  const count = (status) => list.filter((criterion) => criterion?.status === status).length;
  return {
    met: count('met'),
    partial: count('partial'),
    notMet: count('not_met'),
    total: list.length,
  };
}

/** @param {'met'|'partial'|'not_met'} status */
function statusRank(status) {
  if (status === 'met') return 2;
  if (status === 'partial') return 1;
  return 0;
}

/**
 * Compare two attempts criterion by criterion (D-10, LOOP-03). Only counts and per-criterion
 * transitions — never a text or code diff.
 * @param {object[]} previous
 * @param {object[]} next
 * @returns {{ from: number, to: number, total: number,
 *   changes: Array<{ key: string, from: string|null, to: string|null, kind: string }> }}
 */
export function criteriaDelta(previous = [], next = []) {
  const before = Array.isArray(previous) ? previous : [];
  const after = Array.isArray(next) ? next : [];
  const beforeByKey = new Map(before.map((criterion) => [criterion.key, criterion]));
  const seen = new Set();
  const changes = [];

  for (const criterion of after) {
    seen.add(criterion.key);
    const previousStatus = beforeByKey.get(criterion.key)?.status ?? null;
    changes.push({
      key: criterion.key,
      from: previousStatus,
      to: criterion.status,
      kind: changeKind(previousStatus, criterion.status),
    });
  }
  for (const criterion of before) {
    if (seen.has(criterion.key)) continue;
    changes.push({ key: criterion.key, from: criterion.status, to: null, kind: 'removed' });
  }

  return {
    from: summarizeCriteria(before).met,
    to: summarizeCriteria(after).met,
    total: after.length,
    changes,
  };
}

/**
 * @param {string|null} from
 * @param {string|null} to
 * @returns {'added'|'removed'|'improved'|'worsened'|'unchanged'}
 */
function changeKind(from, to) {
  if (from === null) return 'added';
  if (to === null) return 'removed';
  if (from === to) return 'unchanged';
  return statusRank(to) > statusRank(from) ? 'improved' : 'worsened';
}

/* ------------------------------------------------------------------ passing predicates */

/**
 * A quiz attempt passes when every question is correct and, if a review exists, every criterion is
 * met (D-08). `total` must be truthy so an empty attempt never passes.
 * @param {{ score?: number|null, total?: number|null, criteria?: object[]|null }} input
 * @returns {boolean}
 */
export function quizPassed({ score, total, criteria = null } = {}) {
  if (!total) return false;
  if (score !== total) return false;
  return Array.isArray(criteria) ? reviewPassed(criteria) : true;
}

/**
 * A workspace attempt passes when it has at least one check and all of them passed.
 * @param {object[]} checks
 * @returns {boolean}
 */
export function workspacePassed(checks = []) {
  const list = Array.isArray(checks) ? checks : [];
  return list.length > 0 && list.every((check) => check?.passed === true || check?.ok === true);
}

/**
 * A review passes only when every criterion is `met`; `partial` is non-passing (D-08).
 * @param {object[]} criteria
 * @returns {boolean}
 */
export function reviewPassed(criteria = []) {
  const list = Array.isArray(criteria) ? criteria : [];
  return list.length > 0 && list.every((criterion) => criterion?.status === 'met');
}

/* ------------------------------------------------------------------ one-shot revise intents */

/**
 * Arm a pending revise intent on a React ref. Truthy intents only, so an accidental `null` never
 * clears an armed revision.
 * @param {{ current: object|null }} ref
 * @param {object|null} intent
 * @returns {{ current: object|null }}
 */
export function armRevision(ref, intent) {
  if (ref && intent) ref.current = intent;
  return ref;
}

/**
 * Consume a pending revise intent exactly once. Callers consume BEFORE awaiting the save, so a
 * failed attempt cannot leak the revision onto the next one.
 * @param {{ current: object|null }} ref
 * @returns {object|null}
 */
export function consumeRevision(ref) {
  if (!ref) return null;
  const intent = ref.current ?? null;
  ref.current = null;
  return intent;
}

/**
 * The revision intent for a quiz attempt: prefer the stored review message, fall back to the
 * attempt row itself (D-07).
 * @param {{ reviewId?: string|null, attemptId?: string|null }} input
 * @returns {{ feedbackTable: string, feedbackId: string }|null}
 */
export function quizRevisionIntent({ reviewId = null, attemptId = null } = {}) {
  if (reviewId) return { feedbackTable: 'chat_messages', feedbackId: reviewId };
  if (attemptId) return { feedbackTable: 'quiz_attempts', feedbackId: attemptId };
  return null;
}

/**
 * The revision intent for a tutor review.
 * @param {string|null} reviewId
 * @returns {{ feedbackTable: string, feedbackId: string }|null}
 */
export function tutorRevisionIntent(reviewId) {
  return reviewId ? { feedbackTable: 'chat_messages', feedbackId: reviewId } : null;
}

/**
 * The revision intent for a workspace run.
 * @param {string|null} runId
 * @returns {{ feedbackTable: string, feedbackId: string }|null}
 */
export function workspaceRevisionIntent(runId) {
  return runId ? { feedbackTable: 'run_results', feedbackId: runId } : null;
}

/* ------------------------------------------------------------------ tutor rubric + questions */

/**
 * The persisted tutor rubric: the `{ key, label }` list of the EARLIEST tutor review in the
 * transcript. Quiz reviews are ignored, and the later model paraphrase never replaces the rubric
 * (D-01 tutor clause, Pitfall 7/8).
 * @param {Array<{ role?: string, mode?: string, content?: string }>} messages transcript,
 *   oldest first
 * @returns {Array<{ key: string, label: string }>}
 */
export function tutorRubricFromReviews(messages = []) {
  const list = Array.isArray(messages) ? messages : [];
  for (const message of list) {
    if (!message || message.role !== 'assistant' || message.mode !== 'review') continue;
    const record = parseReviewRecord(message.content);
    if (!record || record.surface !== 'tutor') continue;
    return record.criteria.map((criterion) => ({ key: criterion.key, label: criterion.label }));
  }
  return [];
}

/**
 * Overlay provider-written questions onto deterministic criteria. Only non-`met` criteria with a
 * non-empty question are replaced; `met` stays `null` and missing keys keep the fallback (D-04).
 * @param {object[]} criteria
 * @param {Record<string, string>} questions
 * @returns {object[]}
 */
export function mergeReviewQuestions(criteria = [], questions = {}) {
  const map = questions && typeof questions === 'object' ? questions : {};
  return (Array.isArray(criteria) ? criteria : []).map((criterion) => {
    if (!criterion) return criterion;
    if (criterion.status === 'met') return { ...criterion, question: null };
    const enriched = map[criterion.key];
    return typeof enriched === 'string' && enriched.trim()
      ? { ...criterion, question: enriched }
      : { ...criterion };
  });
}
