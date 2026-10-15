import { describe, it, expect } from 'vitest';
import {
  COURSE_KINDS,
  COURSE_KIND_IDS,
  parseCourseMarkdown,
  toCourseMarkdown,
  courseFromMarkdown,
  progress,
  nextLesson,
  dayKey,
  slugify,
} from '../src/lib/course.js';

describe('course kinds', () => {
  it('exposes the four kinds with labels and descriptions', () => {
    expect(COURSE_KIND_IDS).toEqual(['conceptual', 'programming', 'quantitative', 'skill']);
    for (const kind of COURSE_KINDS) {
      expect(kind.label).toBeTruthy();
      expect(kind.description).toBeTruthy();
    }
  });
});

describe('COURSE.md round trip', () => {
  const course = {
    id: 'c1',
    title: 'JavaScript basics',
    level: 'Beginner',
    kind: 'programming',
    goal: 'Build a small app',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-02T00:00:00.000Z',
    lessons: [
      { id: 'l1', position: 1, title: 'Intro', status: 'done', completed_at: '2026-10-03T00:00:00.000Z' },
      { id: 'l2', position: 2, title: 'Loops & arrays', status: 'active' },
    ],
  };

  it('serialises then re-parses title, level, kind and sections', () => {
    const md = toCourseMarkdown(course);
    const parsed = parseCourseMarkdown(md);
    expect(parsed.title).toBe('JavaScript basics');
    expect(parsed.level).toBe('Beginner');
    expect(parsed.kind).toBe('programming');
    expect(parsed.sections.map((s) => s.title)).toEqual(['Intro', 'Loops & arrays']);
    expect(parsed.sections.map((s) => s.status)).toEqual(['done', 'active']);
  });

  it('parses legacy checklist and table flavours', () => {
    const checklist = '⬜ 1. One\n🔄 2. Two\n✅ 3. Three';
    const table = '| 1 | **One** | ✅ Done | — |\n| 2 | **Two** | ⬜ Not started | — |';
    expect(parseCourseMarkdown(checklist).sections.map((s) => s.status)).toEqual(['todo', 'active', 'done']);
    expect(parseCourseMarkdown(table).sections.map((s) => s.title)).toEqual(['One', 'Two']);
  });

  it('imports a course from markdown', () => {
    const course2 = courseFromMarkdown('⬜ 1. Alpha\n⬜ 2. Beta', { title: 'X', kind: 'quantitative' });
    expect(course2.lessons).toHaveLength(2);
    expect(course2.kind).toBe('quantitative');
  });
});

describe('course helpers', () => {
  it('progress and nextLesson', () => {
    const course = {
      lessons: [
        { status: 'done' },
        { status: 'active' },
        { status: 'todo' },
      ],
    };
    expect(progress(course)).toEqual({ total: 3, done: 1, pct: 33 });
    expect(nextLesson(course).status).toBe('active');
  });

  it('slugify', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
    expect(slugify('')).toBe('course');
  });
});

describe('day keys', () => {
  it('formats a local calendar day', () => {
    expect(dayKey(new Date('2026-10-15T12:00:00'))).toBe('2026-10-15');
  });
});
