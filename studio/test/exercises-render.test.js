/**
 * @vitest-environment node
 *
 * RON-266 — server-rendered widget output: escaped template text, localized account glosses, no
 * answer echo and no "show answer" affordance.
 */
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ExerciseSurface } from '../src/components/exercises/ExerciseSurface.jsx';
import { JournalEntryWidget } from '../src/components/exercises/JournalEntryWidget.jsx';
import { AttemptHistory } from '../src/components/exercises/AttemptHistory.jsx';

const ACCOUNTS = [
  { name: '現金', gloss: 'Cash' },
  { name: '売上', gloss: 'Sales' },
  { name: '普通預金', gloss: 'Ordinary deposit' },
  { name: '仕入', gloss: 'Purchases' },
  { name: '売掛金', gloss: 'Accounts receivable' },
  { name: '買掛金', gloss: 'Accounts payable' },
];

const SPEC = {
  version: 1,
  type: 'journal-entry',
  id: 'l1-e1',
  prompt: '商品 50,000 円を現金で売り上げた。',
  promptGloss: 'Sold goods for ¥50,000 in cash.',
  accounts: ACCOUNTS,
  answer: {
    debit: [{ account: '現金', amount: 50000 }],
    credit: [{ account: '売上', amount: 50000 }],
  },
  hints: ['First hint.', 'Second hint.', 'Third hint.'],
};

const LESSON = { id: 'lesson-1', course_id: 'course-1' };
const exercise = (over = {}) => ({ id: 'ex-1', type: 'journal-entry', spec: SPEC, ...over });

describe('RON-266 exercises: rendered surface', () => {
  it('renders one widget per exercise and skips unknown types', () => {
    const html = renderToString(
      createElement(ExerciseSurface, {
        lesson: LESSON,
        course: { id: 'course-1', kind: 'skill' },
        exercises: [
          exercise(),
          { id: 'ex-2', type: 'matching', spec: { ...SPEC, prompt: 'UNKNOWN-TYPE-PROMPT' } },
        ],
      })
    );
    expect(html).toContain('商品 50,000 円を現金で売り上げた。');
    expect(html).not.toContain('UNKNOWN-TYPE-PROMPT');
    expect(html).not.toContain('CodeMirror');
  });

  it('RON-266 exercises: spec text is escaped and no raw markup is injected', () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const html = renderToString(
      createElement(ExerciseSurface, {
        lesson: LESSON,
        course: { kind: 'skill' },
        exercises: [exercise({ spec: { ...SPEC, prompt: hostile, promptGloss: hostile } })],
      })
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('onerror="alert(1)"');
  });

  it('RON-266 journal-entry: selectors list chart accounts with the localized gloss', () => {
    const html = renderToString(
      createElement(JournalEntryWidget, { exercise: exercise(), lesson: LESSON })
    );
    const text = html.replace(/<!--.*?-->/g, '');
    for (const account of ACCOUNTS) {
      expect(text).toContain(`${account.name} — ${account.gloss}`);
    }
    expect((html.match(/type="number"/g) || []).length).toBe(2);
  });

  it('RON-266 journal-entry: correct state echoes no key row', () => {
    const widget = renderToString(
      createElement(JournalEntryWidget, { exercise: exercise(), lesson: LESSON })
    );
    const history = renderToString(
      createElement(AttemptHistory, {
        attempts: [
          {
            id: 'attempt-1',
            correct: true,
            created_at: '2026-11-01T10:00:00.000Z',
            rows: { debit: [{ account: '現金', amount: 50000 }] },
            result: { correct: true, totals: { debit: 50000, credit: 50000 } },
          },
        ],
      })
    );
    // The prompt states the transaction amount; nothing the widget echoes from the key may appear.
    expect(widget).not.toContain('Correct —');
    expect(widget).not.toContain('value="50000"');
    for (const leaked of ['現金', '50000', '50,000', '売上']) {
      expect(history).not.toContain(leaked);
    }
    expect(history).toContain('Attempt 1');
  });

  it('offers no control that reveals the answer', () => {
    const html = renderToString(
      createElement(JournalEntryWidget, { exercise: exercise(), lesson: LESSON })
    );
    expect(html.toLowerCase()).not.toContain('show answer');
    expect(html.toLowerCase()).not.toContain('reveal');
    expect(html.toLowerCase()).not.toContain('giải');
    expect(html).not.toContain('First hint.');
  });
});
