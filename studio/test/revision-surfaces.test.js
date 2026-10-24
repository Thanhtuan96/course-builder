/**
 * Wave-0 SSR smoke for the three surfaces that wire the revision loop (LOOP-01..LOOP-04).
 *
 * SSR cannot reach a quiz completion card, a loaded tutor transcript or a loaded workspace, so these
 * assertions cover only what is renderable without effects. They become the surface gate for plans
 * 05 and 06 (`-t "QuizPanel"`, `-t "TutorPanel"`).
 *
 * Red today: TutorPanel has no "Review my attempt" action yet.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import { QuizPanel } from '../src/components/practice/QuizPanel.jsx';
import { TutorPanel } from '../src/components/tutor/TutorPanel.jsx';
import { CodeWorkspace } from '../src/components/workspace/CodeWorkspace.jsx';

const course = { id: 'c1', title: 'Go', level: 'Beginner', kind: 'conceptual', lessons: [] };

// `normalizeQuizItem` drops any item without exactly four options and an integer answerIndex 0..3.
const quizSeed = JSON.stringify([
  { question: 'Q1', options: ['alpha', 'beta', 'gamma', 'delta'], answerIndex: 0, explanation: 'Because.' },
]);

const quizLesson = { id: 'l1', position: 1, title: 'T', summary: 's', quiz_seed: quizSeed };
const lesson = { id: 'l1', position: 1, title: 'T', summary: 's' };

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
});

describe('lesson surfaces', () => {
  it('QuizPanel renders the question screen without a revise action', () => {
    const html = renderToString(createElement(QuizPanel, { lesson: quizLesson, course }));

    expect(html).toContain('Q1');
    expect(html).toContain('>A<');
    expect(html).toContain('>B<');
    expect(html).toContain('>C<');
    expect(html).toContain('>D<');
    expect(html).not.toContain('Revise this attempt');
    expect(html).not.toContain('Attempt history');
  });

  it('TutorPanel offers the review action', () => {
    const html = renderToString(createElement(TutorPanel, { lesson, course }));

    expect(html).toContain('Review my attempt');
    expect(html).toContain('Check my answer');
    expect(html).toContain('Give me a hint');
    expect(html).toContain('Explain simpler');
    expect(html).toContain('Quiz me');
  });

  it('TutorPanel in capstone mode offers no review action', () => {
    const html = renderToString(
      createElement(TutorPanel, { lesson, course, capstone: true, capstoneBrief: '# Brief' })
    );

    expect(html).not.toContain('Review my attempt');
    expect(html.toLowerCase()).not.toContain('give me a hint');
    expect(html).not.toContain('Revise this attempt');
    expect(html).not.toContain('Attempt history');
  });

  it('CodeWorkspace renders its loading shell without a runner claim', () => {
    const html = renderToString(createElement(CodeWorkspace, { lesson, course }));

    expect(html).toContain('Loading workspace…');
    expect(html).not.toContain('Local server');
    expect(html).not.toMatch(/sandbox/i);
  });
});
