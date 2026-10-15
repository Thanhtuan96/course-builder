/**
 * @vitest-environment node
 *
 * The shared COURSE.md export helper (HANDOFF-23) — used by both the Course page and DataPanel.
 * Runs in Node by stubbing the small DOM surface the download helper touches.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import { exportCourseMarkdown } from '../src/lib/course-export.js';

let clicked;

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
  clicked = [];
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock');
  globalThis.URL.revokeObjectURL = vi.fn();
  globalThis.document = {
    body: { appendChild: vi.fn() },
    createElement: vi.fn(() => ({
      href: '',
      download: '',
      click() {
        clicked.push(this.download);
      },
      remove() {},
    })),
  };
});

afterEach(() => {
  delete globalThis.document;
  vi.restoreAllMocks();
});

describe('exportCourseMarkdown', () => {
  it('downloads <slug>-COURSE.md built from the full stored course', async () => {
    const course = await repo.createCourse({
      title: 'JS Basics',
      level: 'Beginner',
      kind: 'programming',
      goal: 'Ship something',
      lessons: [{ title: 'Intro' }, { title: 'Loops' }],
    });

    const filename = await exportCourseMarkdown(course);
    expect(filename).toBe('js-basics-COURSE.md');
    expect(clicked).toEqual(['js-basics-COURSE.md']);
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});
