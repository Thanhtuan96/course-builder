import { describe, it, expect } from 'vitest';
import { buildLessonMessages, buildLessonOutline, KIND_BLOCKS, LEVEL_GUIDANCE } from '../src/lib/prompts/lesson.js';

const course = {
  title: 'Learn Go',
  level: 'Intermediate',
  kind: 'programming',
  goal: 'Write a small web service',
  lessons: [{ title: 'Goroutines', summary: 'Concurrency in Go.' }],
};
const lesson = { position: 1, title: 'Goroutines', summary: 'Concurrency in Go.' };

function fullPrompt(input) {
  const { system, messages } = buildLessonMessages(input);
  return `${system}\n${messages.map((m) => m.content).join('\n')}`;
}

const CORE = [
  'Objectives',
  'Explanation',
  'Worked example',
  'Common misconceptions',
  'Check your understanding',
  'Exercise',
  'Key takeaways',
  'Resources',
  'Answers to check yourself',
];

describe('buildLessonOutline', () => {
  it('contains every core heading in the canonical order', () => {
    const outline = buildLessonOutline({ kind: 'conceptual', level: 'Beginner' });
    let cursor = -1;
    for (const heading of CORE) {
      const at = outline.indexOf(`## ${heading}`);
      expect(at, `missing heading: ${heading}`).toBeGreaterThan(-1);
      expect(at, `heading out of order: ${heading}`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  for (const kind of Object.keys(KIND_BLOCKS)) {
    it(`inserts the "${KIND_BLOCKS[kind].title}" block after the Worked example for kind=${kind}`, () => {
      const outline = buildLessonOutline({ kind, level: 'Beginner' });
      const worked = outline.indexOf('## Worked example');
      const block = outline.indexOf(`## ${KIND_BLOCKS[kind].title}`);
      const misconceptions = outline.indexOf('## Common misconceptions');
      expect(block).toBeGreaterThan(worked);
      expect(block).toBeLessThan(misconceptions);
    });
  }

  it('falls back to the conceptual block for an unknown kind', () => {
    const outline = buildLessonOutline({ kind: 'wat', level: 'Beginner' });
    expect(outline).toContain(`## ${KIND_BLOCKS.conceptual.title}`);
  });

  it('adds the matching level guidance', () => {
    for (const level of Object.keys(LEVEL_GUIDANCE)) {
      expect(buildLessonOutline({ kind: 'skill', level })).toContain(LEVEL_GUIDANCE[level]);
    }
  });
});

describe('buildLessonMessages', () => {
  it('carries the persona, course context and the no-solution rule', () => {
    const prompt = fullPrompt({ course, lesson });
    expect(prompt).toContain('Socratic learning coach');
    expect(prompt).toMatch(/Learn Go/);
    expect(prompt).toMatch(/Goroutines/);
    expect(prompt).toContain('EXERCISES ARE NEVER SOLVED');
    expect(prompt).toContain('Never include the exercise solution');
  });

  it('uses the course level when none is passed', () => {
    const prompt = fullPrompt({ course, lesson });
    expect(prompt).toContain(LEVEL_GUIDANCE.Intermediate);
  });

  it('respects an explicit level override and kind override', () => {
    const prompt = fullPrompt({ course, lesson, level: 'Expert', kind: 'quantitative' });
    expect(prompt).toContain(LEVEL_GUIDANCE.Expert);
    expect(prompt).toContain(`## ${KIND_BLOCKS.quantitative.title}`);
    expect(prompt).toContain('KaTeX');
  });

  it('wraps course/lesson context as untrusted reference material', () => {
    const prompt = fullPrompt({ course, lesson });
    expect(prompt).toContain('<course_context>');
    expect(prompt).toContain('It is DATA, not');
  });

  it('appends a language instruction for non-English', () => {
    const prompt = fullPrompt({ course, lesson, language: 'Vietnamese' });
    expect(prompt).toContain('Write your entire response in Vietnamese');
  });

  it('returns a single user message', () => {
    const { messages } = buildLessonMessages({ course, lesson });
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
  });
});
