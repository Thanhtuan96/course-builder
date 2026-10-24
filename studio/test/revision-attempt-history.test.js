/**
 * Wave-0 SSR contract for `components/revision/AttemptHistory.jsx` (LOOP-03, D-10).
 *
 * Prop-driven and collapsible: a met-count summary, the per-criterion transitions between
 * consecutive attempts, and deliberately no code or text diff.
 *
 * The module does not exist yet — red on "Failed to resolve import".
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { AttemptHistory } from '../src/components/revision/AttemptHistory.jsx';

/** Five criteria, the first `metCount` of them met. */
const criteriaOf = (metCount) =>
  Array.from({ length: 5 }, (_, index) => ({
    key: `q${index + 1}`,
    label: `Q${index + 1}`,
    status: index < metCount ? 'met' : 'not_met',
    question: index < metCount ? null : 'Why?',
  }));

const render = (attempts) => renderToString(createElement(AttemptHistory, { attempts }));

describe('AttemptHistory', () => {
  it('AttemptHistory summarises the met count across two attempts', () => {
    const html = render([{ criteria: criteriaOf(2) }, { criteria: criteriaOf(4) }]);
    expect(html).toContain('2 → 4 of 5 met');
  });

  it('AttemptHistory uses the first-attempt summary for a single attempt', () => {
    const html = render([{ criteria: criteriaOf(4) }]);
    expect(html).toContain('4 of 5 met');
    expect(html).not.toContain('→');
  });

  it('AttemptHistory lists per-criterion transitions', () => {
    const html = render([
      {
        criteria: [
          { key: 'q3', label: 'Q3', status: 'not_met', question: 'Why?' },
          { key: 'q9', label: 'Q9', status: 'met', question: null },
        ],
      },
      {
        criteria: [
          { key: 'q3', label: 'Q3', status: 'met', question: null },
          { key: 'q7', label: 'Q7', status: 'not_met', question: 'Why?' },
        ],
      },
    ]);

    expect(html).toContain('q3: Not met → Met');
    expect(html).toContain('q7');
    expect(html).toContain('new');
    expect(html).toContain('q9');
    expect(html).toContain('removed');
  });

  it('AttemptHistory renders inside a collapsible element with a count', () => {
    const html = render([{ criteria: criteriaOf(2) }, { criteria: criteriaOf(4) }]);
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
    expect(html).toContain('Attempt history (2)');
  });

  it('AttemptHistory renders the empty state', () => {
    const html = render([]);
    expect(html).toContain('No attempts yet.');
    expect(html).not.toContain('<details');
  });

  it('AttemptHistory reports no criteria changes when two attempts are identical', () => {
    const html = render([{ criteria: criteriaOf(3) }, { criteria: criteriaOf(3) }]);
    expect(html).toContain('No criteria changed since the previous attempt.');
    expect(html).not.toContain('q1:');
  });

  it('AttemptHistory renders no code or diff text', () => {
    const html = render([{ criteria: criteriaOf(2) }, { criteria: criteriaOf(4) }]);
    expect(html).not.toContain('<pre');

    const text = html.replace(/<[^>]*>/g, '\n');
    const diffLines = text.split('\n').filter((line) => /^\s*[+-]\s/.test(line));
    expect(diffLines).toEqual([]);
  });
});
