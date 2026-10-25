import { describe, it, expect } from 'vitest';
import { resolveWorkspaceSeed } from '../src/lib/runner/skeleton.js';

/**
 * RON-196 — the Workspace opened empty because the skeleton was read from `lesson.content_md`,
 * while generated Markdown only ever lands in `lesson_versions`.
 */

const LESSON_MD = `# Your first Bash script

## Explanation

A script is a file the shell executes.

\`\`\`bash
echo "hello"
\`\`\`

## Exercise

Make the script succeed.

\`\`\`bash
#!/usr/bin/env bash
echo "TODO: finish the exercise"
exit 1
\`\`\`
`;

const COURSE = { id: 'c1', title: 'Bash scripting foundations', kind: 'programming' };
const LESSON = { id: 'l1', title: 'Your first Bash script', content_md: null };

describe('RON-196 workspace seed resolution', () => {
  it('RON-196 seeds the skeleton when the Markdown exists only in lesson_versions', () => {
    const { files, persist } = resolveWorkspaceSeed({
      lesson: LESSON,
      course: COURSE,
      version: { content_md: LESSON_MD },
      rows: [],
      runCount: 0,
    });

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('main.sh');
    expect(files[0].content).toContain('TODO: finish the exercise');
    expect(persist).toBe(true);
  });

  it('RON-196 re-seeds stored all-empty files when the lesson has no run result', () => {
    const { files, persist } = resolveWorkspaceSeed({
      lesson: LESSON,
      course: COURSE,
      version: { content_md: LESSON_MD },
      rows: [{ id: 'f1', path: 'main.sh', language: 'bash', content: '  \n' }],
      runCount: 0,
    });

    expect(files[0].content).toContain('TODO: finish the exercise');
    expect(persist).toBe(true);
  });

  it('RON-196 keeps a stored non-empty file over the skeleton', () => {
    const rows = [{ id: 'f1', path: 'main.sh', language: 'bash', content: 'echo "mine"\n' }];
    const { files, persist } = resolveWorkspaceSeed({
      lesson: LESSON,
      course: COURSE,
      version: { content_md: LESSON_MD },
      rows,
      runCount: 0,
    });

    expect(files).toHaveLength(1);
    expect(files[0].content).toBe('echo "mine"\n');
    expect(persist).toBe(false);
  });

  it('RON-196 keeps stored all-empty files when a run result exists', () => {
    const { files, persist } = resolveWorkspaceSeed({
      lesson: LESSON,
      course: COURSE,
      version: { content_md: LESSON_MD },
      rows: [{ id: 'f1', path: 'main.sh', language: 'bash', content: '' }],
      runCount: 1,
    });

    expect(files[0].content).toBe('');
    expect(persist).toBe(false);
  });

  it('RON-196 never persists an empty seed when there is no skeleton', () => {
    const { files, persist } = resolveWorkspaceSeed({
      lesson: LESSON,
      course: COURSE,
      version: { content_md: '# Just prose, no exercise fence' },
      rows: [],
      runCount: 0,
    });

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('main.sh');
    expect(files[0].content).toBe('');
    expect(persist).toBe(false);
  });

  it('RON-196 still seeds from lesson.content_md when the lesson row carries it', () => {
    const { files, persist } = resolveWorkspaceSeed({
      lesson: { ...LESSON, content_md: LESSON_MD },
      course: COURSE,
      version: null,
    });

    expect(files[0].content).toContain('TODO: finish the exercise');
    expect(persist).toBe(true);
  });
});
