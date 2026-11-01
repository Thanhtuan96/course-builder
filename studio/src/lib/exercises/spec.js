/**
 * Exercise specs — declarative, validated data rendered by Studio's own widgets.
 *
 * A spec carries no code and no markup: widgets render every string as text and graders compare
 * data, so nothing here can execute. `validateExerciseSpec` is the strict authoring gate used by
 * templates and seeding; `normalizeExerciseSpec` is the tolerant read path, so one malformed stored
 * row can never blank a whole lesson.
 */
import { z } from 'zod';

/** Widget types Studio can render. Keep in sync with `registry.js`. */
export const EXERCISE_TYPES = Object.freeze(['journal-entry']);

export const MIN_ACCOUNTS = 6;
export const MAX_ACCOUNTS = 12;
export const MIN_DISTRACTORS = 4;
export const MAX_HINTS = 3;
export const MAX_ROWS_PER_SIDE = 6;

/** Accounts that are easy to confuse; a key account's partner must stay in the chart. */
export const CONFUSABLE_PAIRS = Object.freeze([
  Object.freeze(['現金', '普通預金']),
  Object.freeze(['売掛金', '買掛金']),
  Object.freeze(['売上', '仕入']),
  Object.freeze(['借入金', '預り金']),
]);

const accountSchema = z.strictObject({
  name: z.string().trim().min(1).max(24),
  gloss: z.string().trim().min(1).max(64),
});

const rowSchema = z.strictObject({
  account: z.string().trim().min(1).max(24),
  amount: z.number().int().min(1).max(1_000_000_000),
});

const journalEntrySchema = z.strictObject({
  version: z.literal(1),
  type: z.literal('journal-entry'),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/),
  prompt: z.string().trim().min(1).max(300),
  promptGloss: z.string().trim().min(1).max(300),
  accounts: z.array(accountSchema).min(MIN_ACCOUNTS).max(MAX_ACCOUNTS),
  answer: z.strictObject({
    debit: z.array(rowSchema).min(1).max(MAX_ROWS_PER_SIDE),
    credit: z.array(rowSchema).min(1).max(MAX_ROWS_PER_SIDE),
  }),
  hints: z.array(z.string().trim().min(1).max(240)).min(1).max(MAX_HINTS),
});

export const exerciseSpecSchema = z.discriminatedUnion('type', [journalEntrySchema]);

function sumAmounts(rows = []) {
  return rows.reduce((total, row) => total + (Number.isFinite(row.amount) ? row.amount : 0), 0);
}

/**
 * Strict validation used for authored/seeded specs. Throws on any problem so a template typo fails
 * a test instead of rendering a broken or answer-leaking widget.
 * @param {unknown} input
 * @returns {object} the parsed spec
 */
export function validateExerciseSpec(input) {
  const spec = exerciseSpecSchema.parse(input);
  const names = spec.accounts.map((account) => account.name);
  if (new Set(names).size !== names.length) {
    throw new Error('exercise spec: duplicate account names');
  }
  const keyAccounts = new Set(
    [...spec.answer.debit, ...spec.answer.credit].map((row) => row.account)
  );
  for (const account of keyAccounts) {
    if (!names.includes(account)) {
      throw new Error(`exercise spec: answer account is not in the chart: ${account}`);
    }
  }
  if (sumAmounts(spec.answer.debit) !== sumAmounts(spec.answer.credit)) {
    throw new Error('exercise spec: answer key is not balanced');
  }
  return spec;
}

/**
 * Tolerant read path for stored data. Accepts a spec object or its JSON string.
 * @param {unknown} input
 * @returns {object|null} the spec, or null when it cannot be used
 */
export function normalizeExerciseSpec(input) {
  try {
    const raw = typeof input === 'string' ? JSON.parse(input) : input;
    return validateExerciseSpec(raw);
  } catch {
    return null;
  }
}

/**
 * True when an exercise row can be rendered: a known widget type and a usable spec.
 * @param {object|null|undefined} exercise
 */
export function isRenderableExercise(exercise) {
  if (!exercise || typeof exercise !== 'object') return false;
  if (!EXERCISE_TYPES.includes(exercise.type)) return false;
  const candidate = exercise.spec !== undefined ? exercise.spec : exercise.spec_json;
  return normalizeExerciseSpec(candidate) !== null;
}

/**
 * Chart-composition rule (design D1a). Returns a list of violations — empty means the chart offers
 * enough plausible wrong choices.
 * @param {object} spec a validated journal-entry spec
 * @returns {string[]}
 */
export function chartDistractorIssues(spec) {
  const issues = [];
  const names = (spec.accounts || []).map((account) => account.name);
  const key = new Set(
    [...(spec.answer?.debit || []), ...(spec.answer?.credit || [])].map((row) => row.account)
  );
  if (names.length < MIN_ACCOUNTS) issues.push(`chart_too_small:${names.length}`);
  const outside = names.filter((name) => !key.has(name)).length;
  if (outside < MIN_DISTRACTORS) issues.push(`too_few_distractors:${outside}`);
  for (const [first, second] of CONFUSABLE_PAIRS) {
    if (key.has(first) && !names.includes(second)) issues.push(`missing_partner:${second}`);
    if (key.has(second) && !names.includes(first)) issues.push(`missing_partner:${first}`);
  }
  return issues;
}
