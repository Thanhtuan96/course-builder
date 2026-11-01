/**
 * @vitest-environment node
 *
 * RON-266 — the exercise UI is fully localized: identical keys in both catalogs, chrome that follows
 * the UI language, and Japanese account names that never change.
 */
import { describe, it, expect } from 'vitest';
import { catalogKeys, translate } from '../src/lib/i18n/index.js';
import { BOKI_TEMPLATE } from '../src/data/templates/boki-journal-3.js';
import { BOKI_TEMPLATE_VI } from '../src/data/templates/boki-journal-3.vi.js';

describe('RON-266 i18n: exercises namespace', () => {
  it('RON-266 i18n: the exercises namespace has identical en and vi keys', () => {
    const en = catalogKeys('en').filter((key) => key.startsWith('exercises.'));
    const vi = catalogKeys('vi').filter((key) => key.startsWith('exercises.'));
    expect(en.length).toBeGreaterThan(20);
    expect([...en].sort()).toEqual([...vi].sort());
  });

  it('RON-266 i18n: switching language relabels chrome and keeps Japanese accounts', () => {
    const chrome = ['exercises.surface.title', 'exercises.journal.debit', 'exercises.journal.check'];
    for (const key of chrome) {
      expect(translate('en', key)).not.toBe(translate('vi', key));
    }
    expect(translate('en', 'exercises.journal.debit')).toContain('借方');
    expect(translate('vi', 'exercises.journal.debit')).toContain('借方');

    const issue = translate('vi', 'exercises.journal.issue.amount_wrong', {
      n: 2,
      side: translate('vi', 'exercises.journal.side.credit'),
    });
    expect(issue).toContain('2');
    expect(issue).not.toMatch(/amount/i);

    for (let lesson = 0; lesson < BOKI_TEMPLATE.lessons.length; lesson++) {
      const enAccounts = BOKI_TEMPLATE.lessons[lesson].exercises[0].accounts.map((a) => a.name);
      const viAccounts = BOKI_TEMPLATE_VI.lessons[lesson].exercises[0].accounts.map((a) => a.name);
      expect(viAccounts).toEqual(enAccounts);
      for (const name of enAccounts) expect(name).toMatch(/[\u4e00-\u9fff]/);
    }
  });
});
