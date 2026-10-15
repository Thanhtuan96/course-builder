import { describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import { TutorPanel } from '../src/components/tutor/TutorPanel.jsx';

const course = { id: 'c1', title: 'Go', level: 'Beginner', kind: 'conceptual', lessons: [] };
const lesson = { id: 'l1', position: 1, title: 'Variables', summary: 'Declaring variables' };

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
});

describe('TutorPanel render smoke', () => {
  it('renders the chat surface with quick actions and no reveal-solution affordance', () => {
    const html = renderToString(createElement(TutorPanel, { lesson, course }));
    expect(html).toContain('Tutor');
    expect(html).toContain('Explain simpler');
    expect(html).toContain('Give me a hint');
    expect(html).toContain('Check my answer');
    expect(html).toContain('Quiz me');
    expect(html.toLowerCase()).not.toContain('reveal solution');
    expect(html.toLowerCase()).not.toContain('show answer');
  });
});
