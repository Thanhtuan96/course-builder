/**
 * Wave-0 SSR contract for `components/revision/{ReviewFeedback,ReviewMessage,ReviseButton}.jsx`
 * (LOOP-01, LOOP-02, D-06, D-08).
 *
 * Studio renders components with `react-dom/server` only — no DOM, no effects. Every value is a prop.
 * The modules do not exist yet, so this file is red on "Failed to resolve import".
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ReviewFeedback } from '../src/components/revision/ReviewFeedback.jsx';
import { ReviewMessage, reviewSurface } from '../src/components/revision/ReviewMessage.jsx';
import { ReviseButton } from '../src/components/revision/ReviseButton.jsx';

const count = (html, text) => html.split(text).length - 1;

const CRITERIA = [
  { key: 'q1', label: 'First question', status: 'met', question: null },
  { key: 'q2', label: 'Second question', status: 'partial', question: 'Q partial?' },
  { key: 'q3', label: 'Third question', status: 'not_met', question: 'Q not met?' },
];

const RECORD = {
  surface: 'quiz',
  attemptTable: 'quiz_attempts',
  attemptId: 'a1',
  passing: false,
  criteria: CRITERIA,
};

describe('ReviewFeedback', () => {
  it('ReviewFeedback renders one row per criterion with a status chip', () => {
    const html = renderToString(createElement(ReviewFeedback, { criteria: CRITERIA }));

    expect(html).toContain('Met');
    expect(html).toContain('Partly met');
    expect(html).toContain('Not met');
    for (const criterion of CRITERIA) {
      expect(count(html, criterion.label), criterion.label).toBe(1);
    }
  });

  it('ReviewFeedback renders exactly one Socratic question per unmet criterion', () => {
    const html = renderToString(createElement(ReviewFeedback, { criteria: CRITERIA }));

    expect(count(html, 'Q partial?')).toBe(1);
    expect(count(html, 'Q not met?')).toBe(1);
    expect(count(html, 'A question for you')).toBe(2);

    const onlyMet = renderToString(createElement(ReviewFeedback, { criteria: [CRITERIA[0]] }));
    expect(count(onlyMet, 'A question for you')).toBe(0);
  });

  it('ReviewFeedback shows no revise action when the criteria all pass', () => {
    const html = renderToString(
      createElement(ReviewFeedback, { criteria: [CRITERIA[0]], showRevise: true })
    );
    expect(html).not.toContain('Revise this attempt');
  });

  it('ReviewFeedback shows the revise action as the primary button when non-passing', () => {
    const html = renderToString(
      createElement(ReviewFeedback, { criteria: CRITERIA, showRevise: true, onRevise: () => {} })
    );
    expect(html).toContain('Revise this attempt');
    expect(html).toContain('bg-indigo-600');
  });

  it('ReviewFeedback renders an empty state', () => {
    const html = renderToString(createElement(ReviewFeedback, { criteria: [] }));
    expect(html).toContain('Nothing to review yet.');
  });
});

describe('ReviewMessage', () => {
  it('ReviewMessage falls back to plain text for malformed content', () => {
    const html = renderToString(
      createElement(ReviewMessage, {
        message: { role: 'assistant', mode: 'review', content: 'not json' },
      })
    );

    expect(html).toContain('not json');
    expect(html).not.toContain('Partly met');
    expect(html).not.toContain('>Met<');
  });

  it('ReviewMessage renders the review for a valid record', () => {
    const html = renderToString(
      createElement(ReviewMessage, {
        message: { role: 'assistant', mode: 'review', content: JSON.stringify(RECORD) },
      })
    );

    expect(html).toContain('First question');
    expect(html).toContain('Not met');
    expect(html).toContain('Q not met?');
  });

  it('reviewSurface reports the record surface and refuses malformed content', () => {
    expect(reviewSurface({ content: JSON.stringify(RECORD) })).toBe('quiz');
    expect(reviewSurface({ content: 'not json' })).toBeNull();
  });
});

describe('ReviseButton', () => {
  it('ReviseButton is a primary button carrying the label and hint', () => {
    const html = renderToString(
      createElement(ReviseButton, {
        hint: 'Answer the same questions again.',
        onClick: () => {},
      })
    );

    expect(html).toContain('Revise this attempt');
    expect(html).toContain('bg-indigo-600');
    expect(html).toContain('Answer the same questions again.');
  });
});
