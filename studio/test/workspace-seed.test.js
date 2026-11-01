import { describe, it, expect, beforeEach } from 'vitest';
import { planReset, resolveWorkspaceSeed } from '../src/lib/runner/skeleton.js';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';

/**
 * RON-196 — the Workspace opened empty because the skeleton was read from `lesson.content_md`,
 * while generated Markdown only ever lands in `lesson_versions`.
 */

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
});

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
    const { files, persist, stalePaths } = resolveWorkspaceSeed({
      lesson: LESSON,
      course: COURSE,
      version: { content_md: LESSON_MD },
      rows: [{ id: 'f1', path: 'main.sh', language: 'bash', content: '  \n' }],
      runCount: 0,
    });

    expect(files[0].content).toContain('TODO: finish the exercise');
    expect(persist).toBe(true);
    // Same path as the seed: overwritten, not pruned.
    expect(stalePaths).toEqual([]);
  });

  it('RON-196 soft-deletes a blank leftover row the skeleton does not replace', async () => {
    const course = await repo.createCourse({
      title: 'Bash scripting foundations',
      lessons: [{ title: 'L1' }],
    });
    const lesson = course.lessons[0];
    // What the pre-fix build persisted: the course guessed JavaScript and wrote an empty seed.
    await repo.saveWorkspaceFile({ lessonId: lesson.id, path: 'main.js', language: 'javascript', content: '' });
    const version = await repo.addLessonVersion(lesson.id, { content_md: LESSON_MD });

    const { files, persist, stalePaths } = resolveWorkspaceSeed({
      lesson,
      course,
      version,
      rows: await repo.listWorkspaceFiles(lesson.id),
      runCount: 0,
    });

    expect(files.map((f) => f.path)).toEqual(['main.sh']);
    expect(persist).toBe(true);
    expect(stalePaths).toEqual(['main.js']);

    // Same writes the load effect performs.
    for (const file of files) {
      await repo.saveWorkspaceFile({
        courseId: course.id,
        lessonId: lesson.id,
        path: file.path,
        language: file.language,
        content: file.content,
      });
    }
    for (const path of stalePaths) await repo.deleteWorkspaceFile({ lessonId: lesson.id, path });

    expect((await repo.listWorkspaceFiles(lesson.id)).map((r) => r.path)).toEqual(['main.sh']);
  });

  it('RON-196 keeps a stored non-empty file over the skeleton', () => {
    const rows = [{ id: 'f1', path: 'main.sh', language: 'bash', content: 'echo "mine"\n' }];
    const { files, persist, stalePaths } = resolveWorkspaceSeed({
      lesson: LESSON,
      course: COURSE,
      version: { content_md: LESSON_MD },
      rows,
      runCount: 0,
    });

    expect(files).toHaveLength(1);
    expect(files[0].content).toBe('echo "mine"\n');
    expect(persist).toBe(false);
    expect(stalePaths).toEqual([]);
  });

  it('RON-196 keeps stored all-empty files when a run result exists', () => {
    const { files, persist, stalePaths } = resolveWorkspaceSeed({
      lesson: LESSON,
      course: COURSE,
      version: { content_md: LESSON_MD },
      rows: [{ id: 'f1', path: 'main.sh', language: 'bash', content: '' }],
      runCount: 1,
    });

    expect(files[0].content).toBe('');
    expect(persist).toBe(false);
    expect(stalePaths).toEqual([]);
  });

  it('RON-196 never persists an empty seed or prunes rows when there is no skeleton', () => {
    const { files, persist, stalePaths } = resolveWorkspaceSeed({
      lesson: LESSON,
      course: COURSE,
      version: { content_md: '# Just prose, no exercise fence' },
      rows: [{ id: 'f1', path: 'main.js', language: 'javascript', content: '' }],
      runCount: 0,
    });

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('main.sh');
    expect(files[0].content).toBe('');
    expect(persist).toBe(false);
    expect(stalePaths).toEqual([]);
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

// RON-265 — the exercise skeleton is a Dockerfile, which no runner can execute. Seeding the JS
// reference file next to it (or writing an empty `main.js`) is worse than seeding nothing.
const DOCKER_LESSON_MD = `# Bài 1: Dockerfile đầu tiên

## Bài tập

\`\`\`dockerfile
# TODO 1: chọn base image
FROM node:20-alpine

# TODO 2: chạy ứng dụng
CMD ["node", "health.js"]
\`\`\`

\`\`\`js
// health.js — có sẵn, không cần sửa
console.log("ok");
\`\`\`

\`\`\`bash
docker build -t my-app:1 .
\`\`\`
`;

const DOCKER_COURSE = { id: 'c2', title: 'Docker cơ bản', kind: 'programming', language: 'javascript' };

describe('RON-265 unsupported exercise skeleton', () => {
  it('RON-265 reports the dockerfile skeleton and seeds nothing', () => {
    const { files, persist, stalePaths, unsupportedSkeleton } = resolveWorkspaceSeed({
      lesson: LESSON,
      course: DOCKER_COURSE,
      version: { content_md: DOCKER_LESSON_MD },
      rows: [],
      runCount: 0,
    });

    expect(files).toEqual([]);
    expect(persist).toBe(false);
    expect(stalePaths).toEqual([]);
    expect(unsupportedSkeleton.info).toBe('dockerfile');
    expect(unsupportedSkeleton.content).toContain('# TODO 1');
  });

  it('RON-265 never writes a bogus entry file over a blank stored row', () => {
    const { files, persist, stalePaths, unsupportedSkeleton } = resolveWorkspaceSeed({
      lesson: LESSON,
      course: DOCKER_COURSE,
      version: { content_md: DOCKER_LESSON_MD },
      rows: [{ id: 'f1', path: 'main.js', language: 'javascript', content: '  \n' }],
      runCount: 0,
    });

    expect(files).toEqual([]);
    expect(persist).toBe(false);
    expect(stalePaths).toEqual([]);
    expect(unsupportedSkeleton.info).toBe('dockerfile');
  });

  it('RON-265 keeps a stored file the learner already has and reports no unsupported skeleton', () => {
    const { files, persist, unsupportedSkeleton } = resolveWorkspaceSeed({
      lesson: LESSON,
      course: DOCKER_COURSE,
      version: { content_md: DOCKER_LESSON_MD },
      rows: [{ id: 'f1', path: 'Dockerfile', language: null, content: 'FROM node:20-alpine\n' }],
      runCount: 0,
    });

    expect(files.map((f) => f.path)).toEqual(['Dockerfile']);
    expect(persist).toBe(false);
    expect(unsupportedSkeleton).toBeNull();
  });
});

// MUST-1 — a lesson opened before the fix already has the reference fence persisted, so the stored
// rows won unless they are recognised as a stale seed.
const HEALTH_JS = '// health.js — có sẵn, không cần sửa\nconsole.log("ok");';

describe('RON-265 stale reference seed', () => {
  it('RON-265 replaces a stored reference fence with the unsupported notice', () => {
    const { files, persist, stalePaths, unsupportedSkeleton } = resolveWorkspaceSeed({
      lesson: LESSON,
      course: DOCKER_COURSE,
      version: { content_md: DOCKER_LESSON_MD },
      rows: [{ id: 'f1', path: 'main.js', language: 'javascript', content: HEALTH_JS }],
      runCount: 0,
    });

    expect(files).toEqual([]);
    expect(persist).toBe(false);
    expect(stalePaths).toEqual(['main.js']);
    expect(unsupportedSkeleton.info).toBe('dockerfile');
  });

  it('RON-265 replaces a stored reference fence with the runnable skeleton', () => {
    const { files, persist, stalePaths, unsupportedSkeleton } = resolveWorkspaceSeed({
      lesson: LESSON,
      course: COURSE,
      version: { content_md: LESSON_MD },
      rows: [{ id: 'f1', path: 'main.js', language: 'javascript', content: 'echo "hello"' }],
      runCount: 0,
    });

    expect(files.map((f) => f.path)).toEqual(['main.sh']);
    expect(files[0].content).toContain('TODO: finish the exercise');
    expect(persist).toBe(true);
    expect(stalePaths).toEqual(['main.js']);
    expect(unsupportedSkeleton).toBeNull();
  });

  it('RON-265 keeps a stored file the learner edited', () => {
    const { files, persist, stalePaths, unsupportedSkeleton } = resolveWorkspaceSeed({
      lesson: LESSON,
      course: DOCKER_COURSE,
      version: { content_md: DOCKER_LESSON_MD },
      rows: [
        { id: 'f1', path: 'main.js', language: 'javascript', content: `${HEALTH_JS}\n// my notes` },
      ],
      runCount: 0,
    });

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('main.js');
    expect(files[0].content).toContain('// my notes');
    expect(persist).toBe(false);
    expect(stalePaths).toEqual([]);
    expect(unsupportedSkeleton).toBeNull();
  });

  it('RON-265 keeps every stored file when one of them is learner work', () => {
    const { files, stalePaths } = resolveWorkspaceSeed({
      lesson: LESSON,
      course: DOCKER_COURSE,
      version: { content_md: DOCKER_LESSON_MD },
      rows: [
        { id: 'f1', path: 'main.js', language: 'javascript', content: HEALTH_JS },
        { id: 'f2', path: 'util.js', language: 'javascript', content: 'export const x = 1;\n' },
      ],
      runCount: 0,
    });

    expect(files.map((f) => f.path)).toEqual(['main.js', 'util.js']);
    expect(stalePaths).toEqual([]);
  });
});

// MUST-2 — reset has to drop the stored rows itself: the unsupported plan seeds nothing, so nothing
// would overwrite the reference seed and a reload would bring it back.
describe('RON-265 workspace reset', () => {
  it('RON-265 reset drops every stored file when the skeleton cannot run', () => {
    const plan = planReset({
      lesson: { ...LESSON, content_md: DOCKER_LESSON_MD },
      course: DOCKER_COURSE,
      storedPaths: ['main.js', 'util.js'],
    });

    expect(plan.files).toEqual([]);
    expect(plan.persist).toBe(false);
    expect(plan.unsupportedSkeleton.info).toBe('dockerfile');
    expect(plan.deletePaths).toEqual(['main.js', 'util.js']);
  });

  it('RON-265 reset keeps stored files when the skeleton can run', () => {
    const plan = planReset({
      lesson: { ...LESSON, content_md: LESSON_MD },
      course: COURSE,
      storedPaths: ['main.js'],
    });

    expect(plan.files.map((f) => f.path)).toEqual(['main.sh']);
    expect(plan.persist).toBe(true);
    expect(plan.unsupportedSkeleton).toBeNull();
    expect(plan.deletePaths).toEqual([]);
  });
});

describe('RON-265 stale seed through the adapter', () => {
  it('RON-265 soft-deletes the reference seed the load effect replaces', async () => {
    const course = await repo.createCourse({ title: 'Docker cơ bản', lessons: [{ title: 'L1' }] });
    const lesson = course.lessons[0];
    await repo.saveWorkspaceFile({
      lessonId: lesson.id,
      path: 'main.js',
      language: 'javascript',
      content: HEALTH_JS,
    });
    const version = await repo.addLessonVersion(lesson.id, { content_md: DOCKER_LESSON_MD });

    const { files, stalePaths, unsupportedSkeleton } = resolveWorkspaceSeed({
      lesson,
      course,
      version,
      rows: await repo.listWorkspaceFiles(lesson.id),
      runCount: 0,
    });

    expect(unsupportedSkeleton.info).toBe('dockerfile');
    expect(stalePaths).toEqual(['main.js']);

    // Same writes the load effect performs: seed (nothing here), then drop the stale rows.
    for (const file of files) {
      await repo.saveWorkspaceFile({
        courseId: course.id,
        lessonId: lesson.id,
        path: file.path,
        language: file.language,
        content: file.content,
      });
    }
    for (const path of stalePaths) await repo.deleteWorkspaceFile({ lessonId: lesson.id, path });

    expect(await repo.listWorkspaceFiles(lesson.id)).toEqual([]);
  });
});
