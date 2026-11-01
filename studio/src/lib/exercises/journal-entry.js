/**
 * `journal-entry` widget logic (仕訳) — rows, validation, grading and the hint ladder.
 *
 * Everything here is pure so the whole drill is testable in a Node environment: the component only
 * dispatches actions. Grading never returns an answer: it reports the side and the kind of problem,
 * never a key account or amount.
 */
import { MAX_ROWS_PER_SIDE } from './spec.js';

const SIDES = ['debit', 'credit'];

/** @returns {{ account: string, amount: string }} */
export function emptyRow() {
  return { account: '', amount: '' };
}

/** @returns {object} */
export function initialJournalState() {
  return {
    rows: { debit: [emptyRow()], credit: [emptyRow()] },
    status: 'idle',
    invalid: [],
    result: null,
    hintLevel: 0,
  };
}

/** @param {number} level @param {number} count */
export function nextHintLevel(level, count) {
  const max = Math.max(0, Number(count) || 0);
  return Math.min(max, Math.max(0, Number(level) || 0) + 1);
}

function addRow(rows, side) {
  if (!SIDES.includes(side)) return rows;
  if (rows[side].length >= MAX_ROWS_PER_SIDE) return rows;
  return { ...rows, [side]: [...rows[side], emptyRow()] };
}

function removeRow(rows, side, index) {
  if (!SIDES.includes(side)) return rows;
  if (rows[side].length <= 1) return rows;
  return { ...rows, [side]: rows[side].filter((_, i) => i !== index) };
}

function updateRow(rows, side, index, patch) {
  if (!SIDES.includes(side) || !rows[side]?.[index]) return rows;
  return {
    ...rows,
    [side]: rows[side].map((row, i) => (i === index ? { ...row, ...patch } : row)),
  };
}

function parseAmount(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return Number.NaN;
  const amount = Number(text);
  return Number.isSafeInteger(amount) ? amount : Number.NaN;
}

/**
 * Submitted rows only: a row with neither an account nor an amount is treated as untouched.
 * @param {{ debit: object[], credit: object[] }} rows
 * @returns {{ debit: { account: string, amount: number }[], credit: { account: string, amount: number }[] }}
 */
export function submissionFromRows(rows) {
  const pick = (side) =>
    (rows[side] || [])
      .filter((row) => String(row.account ?? '').trim() !== '' || String(row.amount ?? '').trim() !== '')
      .map((row) => ({ account: String(row.account ?? '').trim(), amount: parseAmount(row.amount) }));
  return { debit: pick('debit'), credit: pick('credit') };
}

/**
 * Local refusal before anything is stored: missing account, unknown account, non-integer or
 * non-positive amount. The widget shows these and never writes an attempt.
 * @param {object} spec
 * @param {{ debit: object[], credit: object[] }} submission
 * @returns {{ side: string, index: number, code: string }[]}
 */
export function validateJournalSubmission(spec, submission) {
  const chart = new Set((spec.accounts || []).map((account) => account.name));
  const issues = [];
  for (const side of SIDES) {
    (submission[side] || []).forEach((row, index) => {
      if (!row.account) issues.push({ side, index, code: 'missing_account' });
      else if (!chart.has(row.account)) issues.push({ side, index, code: 'unknown_account' });
      if (!Number.isInteger(row.amount) || row.amount <= 0) {
        issues.push({ side, index, code: 'invalid_amount' });
      }
    });
  }
  const empty = SIDES.every((side) => (submission[side] || []).length === 0);
  if (empty && issues.length === 0) issues.push({ side: 'debit', index: -1, code: 'nothing_entered' });
  return issues;
}

function multilineCounter(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = `${row.side}|${row.account}|${row.amount}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function keyAmountsBySideAccount(spec) {
  const map = new Map();
  for (const side of SIDES) {
    for (const row of spec.answer[side] || []) {
      const key = `${side}|${row.account}`;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(row.amount);
    }
  }
  return map;
}

/**
 * Deterministic grading: a pure multiset comparison plus a debit/credit balance check, so row order
 * and row placement never matter and duplicates must match. Never exposes a key account or amount.
 * @param {object} spec
 * @param {{ debit: object[], credit: object[] }} submission validated rows with numeric amounts
 */
export function gradeJournalEntry(spec, submission) {
  const totals = {
    debit: (submission.debit || []).reduce((n, row) => n + row.amount, 0),
    credit: (submission.credit || []).reduce((n, row) => n + row.amount, 0),
  };
  const balanced = totals.debit === totals.credit;

  const submitted = SIDES.flatMap((side) =>
    (submission[side] || []).map((row, index) => ({ ...row, side, index }))
  );
  const answer = SIDES.flatMap((side) =>
    (spec.answer[side] || []).map((row) => ({ ...row, side }))
  );

  const remaining = multilineCounter(answer);
  const unmatched = [];
  for (const row of submitted) {
    const key = `${row.side}|${row.account}|${row.amount}`;
    const left = remaining.get(key) || 0;
    if (left > 0) remaining.set(key, left - 1);
    else unmatched.push(row);
  }
  const leftover = [];
  for (const [key, count] of remaining) if (count > 0) leftover.push(key);

  const keyAmounts = keyAmountsBySideAccount(spec);
  const issues = [];
  for (const row of unmatched) {
    const sameSide = keyAmounts.get(`${row.side}|${row.account}`);
    const otherSide = keyAmounts.get(`${row.side === 'debit' ? 'credit' : 'debit'}|${row.account}`);
    let code = 'account_not_right';
    if (sameSide?.has(row.amount)) code = 'extra_row';
    else if (sameSide?.size) code = 'amount_wrong';
    else if (otherSide?.size) code = 'wrong_side';
    issues.push({ side: row.side, index: row.index, code });
  }

  const leftoverBySide = { debit: 0, credit: 0 };
  for (const key of leftover) {
    const [side] = key.split('|');
    leftoverBySide[side] += 1;
  }

  const sideIssues = { debit: null, credit: null };
  for (const side of SIDES) {
    const hasUnmatched = issues.some((issue) => issue.side === side);
    if (leftoverBySide[side] > 0 && !hasUnmatched) {
      const empty = (submission[side] || []).length === 0;
      sideIssues[side] = empty ? 'nothing_entered' : 'needs_more_rows';
    }
  }

  const codes = [];
  const push = (code) => {
    if (code && !codes.includes(code)) codes.push(code);
  };
  for (const issue of issues) push(issue.code);
  for (const side of SIDES) push(sideIssues[side]);
  if (!balanced) push('unbalanced');

  return {
    correct: balanced && unmatched.length === 0 && leftover.length === 0,
    balanced,
    totals,
    issues,
    sideIssues,
    codes,
  };
}

/**
 * Validate then grade in one pure step (the reducer and the component share it, so there is exactly
 * one definition of "check").
 * @param {object} spec
 * @param {{ debit: object[], credit: object[] }} rows widget rows (amounts as strings)
 */
export function gradeRows(spec, rows) {
  const submission = submissionFromRows(rows);
  const invalid = validateJournalSubmission(spec, submission);
  if (invalid.length) return { submission, invalid, result: null };
  return { submission, invalid: [], result: gradeJournalEntry(spec, submission) };
}

/**
 * @param {object} state
 * @param {{ type: string, side?: string, index?: number, account?: string, amount?: string, spec?: object, outcome?: object, count?: number }} action
 */
export function journalEntryReducer(state, action) {
  switch (action.type) {
    case 'set-account':
      return {
        ...state,
        rows: updateRow(state.rows, action.side, action.index, { account: action.account }),
        status: 'idle',
        invalid: [],
        result: null,
      };
    case 'set-amount':
      return {
        ...state,
        rows: updateRow(state.rows, action.side, action.index, { amount: action.amount }),
        status: 'idle',
        invalid: [],
        result: null,
      };
    case 'add-row':
      return { ...state, rows: addRow(state.rows, action.side), status: 'idle', invalid: [], result: null };
    case 'remove-row':
      return {
        ...state,
        rows: removeRow(state.rows, action.side, action.index),
        status: 'idle',
        invalid: [],
        result: null,
      };
    case 'check': {
      const outcome = action.outcome || gradeRows(action.spec, state.rows);
      if (outcome.invalid.length) {
        return { ...state, status: 'invalid', invalid: outcome.invalid, result: null };
      }
      return {
        ...state,
        status: outcome.result.correct ? 'correct' : 'incorrect',
        invalid: [],
        result: outcome.result,
      };
    }
    case 'hint':
      return { ...state, hintLevel: nextHintLevel(state.hintLevel, action.count) };
    case 'reset':
      return { ...initialJournalState(), hintLevel: state.hintLevel };
    default:
      return state;
  }
}
