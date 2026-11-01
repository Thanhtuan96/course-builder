/**
 * @vitest-environment node
 *
 * RON-266 — exercise specs are strict, declarative data, and every chart must offer enough plausible
 * wrong choices to avoid giving the answer away.
 */
import { describe, it, expect } from 'vitest';
import {
  chartDistractorIssues,
  isRenderableExercise,
  normalizeExerciseSpec,
  validateExerciseSpec,
} from '../src/lib/exercises/spec.js';
import { resolveWidget, WIDGET_TYPES } from '../src/lib/exercises/registry.js';

const ACCOUNTS = ['現金', '売上', '普通預金', '仕入', '売掛金', '買掛金'];

const accounts = (names = ACCOUNTS) => names.map((name) => ({ name, gloss: `gloss-${name}` }));

function baseSpec(over = {}) {
  return {
    version: 1,
    type: 'journal-entry',
    id: 'l1-e1',
    prompt: '商品 50,000 円を現金で売り上げた。',
    promptGloss: 'Sold goods for ¥50,000 in cash.',
    accounts: accounts(),
    answer: {
      debit: [{ account: '現金', amount: 50000 }],
      credit: [{ account: '売上', amount: 50000 }],
    },
    hints: ['Name what came in and what went out.'],
    ...over,
  };
}

describe('RON-266 exercises: spec validation', () => {
  it('accepts the documented spec and returns the parsed value', () => {
    const spec = validateExerciseSpec(baseSpec());
    expect(spec.type).toBe('journal-entry');
    expect(spec.accounts).toHaveLength(6);
    expect(spec.answer.debit[0]).toEqual({ account: '現金', amount: 50000 });
  });

  it('rejects unknown keys, bad types and invalid amounts', () => {
    expect(() => validateExerciseSpec(baseSpec({ extra: true }))).toThrow();
    expect(() => validateExerciseSpec(baseSpec({ type: 'matching' }))).toThrow();
    for (const amount of [0, -1, 1.5]) {
      expect(() =>
        validateExerciseSpec(
          baseSpec({ answer: { debit: [{ account: '現金', amount }], credit: [{ account: '売上', amount }] } })
        )
      ).toThrow();
    }
    expect(() => validateExerciseSpec(baseSpec({ hints: ['a', 'b', 'c', 'd'] }))).toThrow();
  });

  it('RON-266 exercises: a chart with fewer than six accounts is rejected', () => {
    expect(() => validateExerciseSpec(baseSpec({ accounts: accounts(ACCOUNTS.slice(0, 5)) }))).toThrow();
  });

  it('rejects answer accounts outside the chart, duplicate accounts and unbalanced keys', () => {
    expect(() =>
      validateExerciseSpec(
        baseSpec({ answer: { debit: [{ account: '借入金', amount: 10 }], credit: [{ account: '売上', amount: 10 }] } })
      )
    ).toThrow();
    expect(() =>
      validateExerciseSpec(baseSpec({ accounts: accounts(['現金', '現金', '売上', '仕入', '売掛金', '買掛金']) }))
    ).toThrow();
    expect(() =>
      validateExerciseSpec(
        baseSpec({ answer: { debit: [{ account: '現金', amount: 10 }], credit: [{ account: '売上', amount: 20 }] } })
      )
    ).toThrow();
  });

  it('normalizes a stored JSON string and refuses unusable input', () => {
    expect(normalizeExerciseSpec(JSON.stringify(baseSpec()))?.id).toBe('l1-e1');
    expect(normalizeExerciseSpec('{not json')).toBeNull();
    expect(normalizeExerciseSpec({ ...baseSpec(), type: 'unknown' })).toBeNull();
  });
});

describe('RON-266 exercises: chart distractors', () => {
  it('accepts a chart with six accounts and four outside the key', () => {
    expect(chartDistractorIssues(validateExerciseSpec(baseSpec()))).toEqual([]);
  });

  it('RON-266 exercises: a chart without four distractors or a partner confuser is flagged', () => {
    const tooThin = validateExerciseSpec(
      baseSpec({ accounts: accounts(['現金', '売上', '普通預金', '仕入', '売掛金', '買掛金']) })
    );
    const thinIssues = chartDistractorIssues({
      ...tooThin,
      accounts: tooThin.accounts.filter((account) => ['現金', '売上', '普通預金'].includes(account.name)),
    });
    expect(thinIssues.some((issue) => issue.startsWith('too_few_distractors'))).toBe(true);

    const noPartner = chartDistractorIssues({
      ...tooThin,
      accounts: tooThin.accounts.filter((account) => account.name !== '普通預金'),
    });
    expect(noPartner).toContain('missing_partner:普通預金');
  });
});

describe('RON-266 exercises: widget registry', () => {
  it('RON-266 exercises: an unknown widget type is skipped, not thrown', () => {
    expect(WIDGET_TYPES).toContain('journal-entry');
    expect(resolveWidget('matching')).toBeNull();
    const widget = resolveWidget('journal-entry');
    expect(typeof widget.Component).toBe('function');
    expect(typeof widget.grade).toBe('function');

    expect(isRenderableExercise({ type: 'matching', spec: baseSpec() })).toBe(false);
    expect(isRenderableExercise({ type: 'journal-entry', spec: baseSpec() })).toBe(true);
    expect(isRenderableExercise({ type: 'journal-entry', spec: { ...baseSpec(), hints: [] } })).toBe(false);
  });
});
