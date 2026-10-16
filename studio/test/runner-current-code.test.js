import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import { setCurrentCode, getCurrentCode, clearCurrentCode, currentCodeBlock } from '../src/lib/runner/current-code.js';

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
});

describe('current-code registry (CODE-05 tutor bridge)', () => {
  it('returns the live buffer when the workspace has recorded one', async () => {
    setCurrentCode('lesson-1', { language: 'javascript', entry: 'main.js', files: { 'main.js': 'console.log(1)' } });
    const snapshot = await getCurrentCode('lesson-1');
    expect(snapshot.files['main.js']).toBe('console.log(1)');
    expect(snapshot.hash).toBeTruthy();
    clearCurrentCode('lesson-1');
  });

  it('falls back to the saved repository files', async () => {
    const course = await repo.createCourse({ title: 'Code course', kind: 'programming', lessons: [{ title: 'L1' }] });
    const lesson = course.lessons[0];
    await repo.saveWorkspaceFile({ courseId: course.id, lessonId: lesson.id, path: 'main.py', language: 'python', content: 'print("hi")' });
    const snapshot = await getCurrentCode(lesson.id);
    expect(snapshot).toBeTruthy();
    expect(snapshot.files['main.py']).toContain('print');
  });

  it('returns null when there is nothing to attach', async () => {
    expect(await getCurrentCode('missing-lesson')).toBeNull();
    expect(await currentCodeBlock('missing-lesson')).toBeNull();
  });

  it('builds a fenced text block for a tutor prompt', async () => {
    setCurrentCode('lesson-2', { language: 'python', entry: 'main.py', files: { 'main.py': 'x = 1' } });
    const block = await currentCodeBlock('lesson-2');
    expect(block).toContain('--- main.py ---');
    expect(block).toContain('x = 1');
    clearCurrentCode('lesson-2');
  });
});
