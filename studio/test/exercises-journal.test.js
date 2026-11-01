/**
 * @vitest-environment node
 *
 * RON-266 — the journal-entry reducer: compound rows, row limits and local refusal of invalid input
 * before anything is stored.
 */
import { describe, it, expect } from 'vitest';
import {
  initialJournalState,
  journalEntryReducer,
  submissionFromRows,
  validateJournalSubmission,
} from '../src/lib/exercises/journal-entry.js';

const ACCOUNTS = ['現金', '売上', '普通預金', '仕入', '売掛金', '買掛金'];

const SPEC = {
  version: 1,
  type: 'journal-entry',
  id: 'l1-e1',
  prompt: '商品 50,000 円を現金で売り上げた。',
  promptGloss: 'Sold goods for ¥50,000 in cash.',
  accounts: ACCOUNTS.map((name) => ({ name, gloss: `gloss-${name}` })),
  answer: {
    debit: [{ account: '現金', amount: 50000 }],
    credit: [{ account: '売上', amount: 50000 }],
  },
  hints: ['Hint one.'],
};

function run(state, ...actions) {
  return actions.reduce((current, action) => journalEntryReducer(current, action), state);
}

describe('RON-266 journal-entry: rows', () => {
  it('starts with one row per side and keeps at least one row', () => {
    const state = initialJournalState();
    expect(state.rows.debit).toHaveLength(1);
    expect(state.rows.credit).toHaveLength(1);
    const afterRemove = run(state, { type: 'remove-row', side: 'debit', index: 0 });
    expect(afterRemove.rows.debit).toHaveLength(1);
  });

  it('RON-266 journal-entry: compound rows are kept on both sides', () => {
    const state = run(
      initialJournalState(),
      { type: 'add-row', side: 'credit' },
      { type: 'add-row', side: 'debit' },
      { type: 'set-account', side: 'debit', index: 0, account: '消耗品費' },
      { type: 'set-amount', side: 'debit', index: 0, amount: '15000' },
      { type: 'set-account', side: 'debit', index: 1, account: '通信費' },
      { type: 'set-amount', side: 'debit', index: 1, amount: '5000' },
      { type: 'set-account', side: 'credit', index: 0, account: '現金' },
      { type: 'set-amount', side: 'credit', index: 0, amount: '20000' },
      { type: 'set-account', side: 'credit', index: 1, account: '預り金' },
      { type: 'set-amount', side: 'credit', index: 1, amount: '0' }
    );
    expect(state.rows.debit).toHaveLength(2);
    expect(state.rows.credit).toHaveLength(2);
    expect(submissionFromRows(state.rows).debit).toEqual([
      { account: '消耗品費', amount: 15000 },
      { account: '通信費', amount: 5000 },
    ]);
    // A row with an account but an unusable amount is still submitted, so it can be refused.
    expect(submissionFromRows(state.rows).credit).toEqual([
      { account: '現金', amount: 20000 },
      { account: '預り金', amount: 0 },
    ]);
  });

  it('drops untouched rows from the submission', () => {
    const state = run(
      initialJournalState(),
      { type: 'set-account', side: 'debit', index: 0, account: '現金' },
      { type: 'set-amount', side: 'debit', index: 0, amount: '100' },
      { type: 'set-account', side: 'credit', index: 0, account: '売上' },
      { type: 'set-amount', side: 'credit', index: 0, amount: '100' }
    );
    expect(submissionFromRows(state.rows).debit).toHaveLength(1);
    expect(submissionFromRows(initialJournalState().rows)).toEqual({ debit: [], credit: [] });
  });
});

describe('RON-266 journal-entry: local refusal', () => {
  it('RON-266 journal-entry: invalid amounts are refused without an attempt', () => {
    for (const amount of ['0', '1.5', 'abc', '']) {
      const state = run(
        initialJournalState(),
        { type: 'set-account', side: 'debit', index: 0, account: '現金' },
        { type: 'set-amount', side: 'debit', index: 0, amount },
        { type: 'set-account', side: 'credit', index: 0, account: '売上' },
        { type: 'set-amount', side: 'credit', index: 0, amount: '100' },
        { type: 'check', spec: SPEC }
      );
      expect(state.status).toBe('invalid');
      expect(state.result).toBeNull();
      expect(state.invalid.map((issue) => issue.code)).toContain('invalid_amount');
    }
  });

  it('refuses a missing account and an account outside the chart', () => {
    const submission = {
      debit: [{ account: '', amount: 100 }],
      credit: [{ account: '借入金', amount: 100 }],
    };
    const codes = validateJournalSubmission(SPEC, submission).map((issue) => issue.code);
    expect(codes).toContain('missing_account');
    expect(codes).toContain('unknown_account');
  });

  it('refuses an entirely empty submission', () => {
    const state = run(initialJournalState(), { type: 'check', spec: SPEC });
    expect(state.status).toBe('invalid');
    expect(state.invalid[0].code).toBe('nothing_entered');
  });
});
