/**
 * @vitest-environment node
 *
 * RON-266 — deterministic, answer-preserving grading for journal entries, plus the hint ladder.
 */
import { describe, it, expect } from 'vitest';
import { gradeJournalEntry, nextHintLevel } from '../src/lib/exercises/journal-entry.js';
import { translate } from '../src/lib/i18n/index.js';

const ACCOUNTS = ['現金', '売上', '普通預金', '仕入', '売掛金', '買掛金', '消耗品費', '通信費'];

const SINGLE = {
  version: 1,
  type: 'journal-entry',
  id: 'l1-e1',
  prompt: 'p',
  promptGloss: 'g',
  accounts: ACCOUNTS.map((name) => ({ name, gloss: `gloss-${name}` })),
  answer: {
    debit: [{ account: '現金', amount: 50000 }],
    credit: [{ account: '売上', amount: 50000 }],
  },
  hints: ['h1', 'h2', 'h3'],
};

const COMPOUND = {
  ...SINGLE,
  id: 'l3-e5',
  answer: {
    debit: [
      { account: '消耗品費', amount: 15000 },
      { account: '通信費', amount: 5000 },
    ],
    credit: [{ account: '現金', amount: 20000 }],
  },
};

const rows = (debit, credit) => ({ debit, credit });

describe('RON-266 grading: determinism', () => {
  it('RON-266 grading: a correct entry passes in any row order', () => {
    const answer = COMPOUND.answer;
    const result = gradeJournalEntry(COMPOUND, {
      debit: [...answer.debit].reverse(),
      credit: answer.credit,
    });
    expect(result.correct).toBe(true);
    expect(result.balanced).toBe(true);
    expect(result.codes).toEqual([]);

    expect(
      gradeJournalEntry(SINGLE, rows([{ account: '現金', amount: 50000 }], [{ account: '売上', amount: 50000 }]))
        .correct
    ).toBe(true);
  });

  it('RON-266 grading: an unbalanced entry is incorrect and says so', () => {
    const result = gradeJournalEntry(
      SINGLE,
      rows([{ account: '現金', amount: 50000 }], [{ account: '売上', amount: 40000 }])
    );
    expect(result.correct).toBe(false);
    expect(result.balanced).toBe(false);
    expect(result.codes).toContain('unbalanced');
  });

  it('RON-266 grading: a wrong account is reported without naming the right one', () => {
    const result = gradeJournalEntry(
      SINGLE,
      rows([{ account: '普通預金', amount: 50000 }], [{ account: '売上', amount: 50000 }])
    );
    expect(result.correct).toBe(false);
    expect(result.balanced).toBe(true);
    expect(result.codes).toEqual(['account_not_right']);
    expect(result.issues[0]).toMatchObject({ side: 'debit', index: 0, code: 'account_not_right' });
  });

  it('RON-266 grading: a wrong amount is reported without naming the right one', () => {
    const result = gradeJournalEntry(
      SINGLE,
      rows([{ account: '現金', amount: 45000 }], [{ account: '売上', amount: 45000 }])
    );
    expect(result.correct).toBe(false);
    expect(result.balanced).toBe(true);
    expect(result.codes).toEqual(['amount_wrong']);
    expect(result.issues.map((issue) => issue.side)).toEqual(['debit', 'credit']);
  });

  it('RON-266 grading: a duplicated row is incorrect unless the key repeats it', () => {
    const result = gradeJournalEntry(
      COMPOUND,
      rows(
        [
          { account: '消耗品費', amount: 15000 },
          { account: '消耗品費', amount: 15000 },
        ],
        [{ account: '現金', amount: 30000 }]
      )
    );
    expect(result.correct).toBe(false);
    expect(result.codes).toContain('extra_row');
  });

  it('reports a missing row on a side', () => {
    const result = gradeJournalEntry(COMPOUND, rows([{ account: '消耗品費', amount: 15000 }], []));
    expect(result.correct).toBe(false);
    expect(result.sideIssues.credit).toBe('nothing_entered');
  });
});

describe('RON-266 grading: no answer leakage', () => {
  it('RON-266 grading: feedback codes never expose a key account or amount', () => {
    const wrong = gradeJournalEntry(
      SINGLE,
      rows([{ account: '借入金', amount: 30000 }], [{ account: '仕入', amount: 30000 }])
    );
    const serialized = JSON.stringify({ codes: wrong.codes, issues: wrong.issues, sideIssues: wrong.sideIssues });
    for (const keyAccount of ['現金', '売上']) expect(serialized).not.toContain(keyAccount);
    expect(serialized).not.toContain('50000');

    const codes = [
      'unbalanced',
      'invalid_amount',
      'missing_account',
      'unknown_account',
      'account_not_right',
      'amount_wrong',
      'wrong_side',
      'extra_row',
      'needs_more_rows',
      'nothing_entered',
    ];
    for (const language of ['en', 'vi']) {
      for (const code of codes) {
        const text = translate(language, `exercises.journal.issue.${code}`, {
          n: 1,
          side: translate(language, 'exercises.journal.side.debit'),
        });
        expect(text).not.toContain('現金');
        expect(text).not.toContain('売上');
        expect(text).not.toContain('50000');
      }
    }
  });
});

describe('RON-266 hints: the ladder', () => {
  it('RON-266 hints: each press reveals exactly one more layer', () => {
    expect(nextHintLevel(0, 3)).toBe(1);
    expect(nextHintLevel(1, 3)).toBe(2);
    expect(nextHintLevel(2, 3)).toBe(3);
    expect(nextHintLevel(3, 3)).toBe(3);
    expect(nextHintLevel(0, 0)).toBe(0);
  });
});
