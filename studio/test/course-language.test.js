/**
 * @vitest-environment node
 *
 * Brief §16 — the lesson language chosen in NewCourse is stored on the course and every prompt
 * builder honours it (falling back to the settings language when the course has none).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import { buildLessonMessages } from '../src/lib/prompts/lesson.js';
import { buildTutorMessages } from '../src/lib/prompts/tutor.js';
import { buildQuizMessages, buildFlashcardsMessages } from '../src/lib/prompts/practice.js';

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
});

describe('course language', () => {
  it('persists language on the course and threads it into every lesson prompt', async () => {
    const course = await repo.createCourse({
      title: 'Lịch sử Việt Nam',
      language: 'Vietnamese',
      lessons: [{ title: 'Bài 1' }],
    });
    const lesson = course.lessons[0];
    expect(course.language).toBe('Vietnamese');

    expect(buildLessonMessages({ course, lesson }).system).toMatch(/in Vietnamese/i);
    expect(buildTutorMessages({ course, lesson }).system).toMatch(/in Vietnamese/i);
    expect(buildQuizMessages({ course, lesson, content: '# x' }).system).toMatch(/in Vietnamese/i);
    expect(buildFlashcardsMessages({ course, lesson, content: '# x' }).system).toMatch(/in Vietnamese/i);
  });

  it('falls back to the settings language when the course has none', () => {
    const course = { title: 'X', level: 'Beginner', language: null };
    const lesson = { title: 'L' };
    expect(buildLessonMessages({ course, lesson, language: 'Vietnamese' }).system).toMatch(/in Vietnamese/i);
    expect(buildLessonMessages({ course, lesson, language: 'English' }).system).not.toMatch(/Write your entire response/);
  });

  it('updateCourse can change the stored language', async () => {
    const course = await repo.createCourse({ title: 'X', language: 'English', lessons: [{ title: 'L' }] });
    const updated = await repo.updateCourse(course.id, { language: 'Vietnamese' });
    expect(updated.language).toBe('Vietnamese');
  });
});
