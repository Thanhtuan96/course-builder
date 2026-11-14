/**
 * RON-372 — imported courses show an empty workspace.
 *
 * `skillforce import` now reads `learning/<slug>/exercises/NN-*` and attaches each file to its
 * lesson as a workspace file, records what it wrote so a re-import never overwrites learner work,
 * and clears the empty seed Studio wrote when a lesson was opened before the first import.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { readCourse } from '../bin/course-reader.js';
import { createStudioStore } from '../bin/studio-store.js';
import {
  planCourseImport,
  applyCourseImport,
  contentHash,
  readExerciseFiles,
  run,
} from '../bin/commands/import.js';
import { useAdapter, saveWorkspaceFile, saveRunResult } from '../studio/src/lib/repo/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGRAMMING = join(__dirname, 'fixtures', 'courses', 'ron-372-exercises');
const CONCEPTUAL = join(__dirname, 'fixtures', 'courses', 'ron-372-conceptual');

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  tempDirs.length = 0;
});

function mkTemp(prefix = 'cp-372-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** A cwd with `learning/<slug>` copied from a fixture. */
function mkCourseCwd(fixture = PROGRAMMING) {
  const cwd = mkTemp();
  const slug = fixture.split('/').pop();
  mkdirSync(join(cwd, 'learning'), { recursive: true });
  cpSync(fixture, join(cwd, 'learning', slug), { recursive: true });
  return cwd;
}

function mkStore() {
  const home = mkTemp('cp-372-db-');
  return createStudioStore({ dbPath: join(home, 'professor.db'), log: () => {} });
}

const lessonId = (slug, n) => `cli-lesson-${slug}-${n}`;

async function planAndApply(cwd, store, { dryRun = false } = {}) {
  const slug = 'ron-372-exercises';
  const course = readCourse(join(cwd, 'learning', slug), { slug });
  const plan = planCourseImport(course);
  const stats = await applyCourseImport(plan, store, { dryRun });
  return { course, plan, stats };
}

async function filesOf(store, id) {
  return store.list('workspace_files', { where: { lesson_id: id }, orderBy: { field: 'path', dir: 'asc' } });
}

describe('RON-372 import: exercise files reach the lesson plan', () => {
  it('RON-372 maps each exercises/NN-* file to its lesson with the extension language', () => {
    const course = readCourse(PROGRAMMING, { slug: 'ron-372-exercises' });
    const plan = planCourseImport(course);

    expect(plan.exerciseCount).toBe(2);
    expect(plan.lessons[0].exercises.map((exercise) => exercise.path)).toEqual([
      '01-project-anatomy-and-auto-configuration.java',
    ]);
    expect(plan.lessons[0].exercises[0]).toMatchObject({ language: 'java' });
    expect(plan.lessons[1].exercises.map((exercise) => exercise.path)).toEqual(['02-warm-up.py']);
    expect(plan.lessons[1].exercises[0]).toMatchObject({ language: 'python' });
  });

  it('RON-372 attaches a conceptual .md exercise with no language', () => {
    const course = readCourse(CONCEPTUAL, { slug: 'ron-372-conceptual' });
    const plan = planCourseImport(course);
    expect(plan.lessons[0].exercises[0]).toMatchObject({
      path: '01-balance-the-ledger.md',
      language: null,
    });
  });

  it('RON-372 reports an exercise numbered past the last lesson instead of attaching it', () => {
    const cwd = mkCourseCwd();
    writeFileSync(join(cwd, 'learning', 'ron-372-exercises', 'exercises', '07-extra.py'), 'print(7)\n');
    const course = readCourse(join(cwd, 'learning', 'ron-372-exercises'), { slug: 'ron-372-exercises' });
    const plan = planCourseImport(course);
    expect(plan.unattachedExercises).toEqual(['07-extra.py']);
    expect(plan.exerciseCount).toBe(2);
  });

  it('RON-372 reads exercises in numeric order and ignores dotfiles', () => {
    const dir = mkTemp();
    mkdirSync(join(dir, 'exercises'), { recursive: true });
    writeFileSync(join(dir, 'exercises', '10-ten.py'), 'ten\n');
    writeFileSync(join(dir, 'exercises', '02-two.py'), 'two\n');
    writeFileSync(join(dir, 'exercises', '.DS_Store'), 'junk');
    const files = readExerciseFiles(dir);
    expect(files.map((file) => file.path)).toEqual(['02-two.py', '10-ten.py']);
  });
});

describe('RON-372 import: lessons open with the exercise file', () => {
  it('RON-372 stores the java and python exercise for lessons 1 and 2', async () => {
    const cwd = mkCourseCwd();
    const store = mkStore();
    await planAndApply(cwd, store);

    const first = await filesOf(store, lessonId('ron-372-exercises', 1));
    expect(first.map((row) => row.path)).toEqual(['01-project-anatomy-and-auto-configuration.java']);
    expect(first[0]).toMatchObject({ language: 'java' });
    expect(first[0].content).toContain('./mvnw spring-boot:run');
    expect(first[0].imported_hash).toBe(contentHash(first[0].content));

    const second = await filesOf(store, lessonId('ron-372-exercises', 2));
    expect(second.map((row) => row.path)).toEqual(['02-warm-up.py']);
    expect(second[0]).toMatchObject({ language: 'python' });
    store.close();
  });

  it('RON-372 stores a conceptual exercise with no language', async () => {
    const cwd = mkCourseCwd(CONCEPTUAL);
    const store = mkStore();
    const course = readCourse(join(cwd, 'learning', 'ron-372-conceptual'), { slug: 'ron-372-conceptual' });
    await applyCourseImport(planCourseImport(course), store);

    const rows = await filesOf(store, lessonId('ron-372-conceptual', 1));
    expect(rows.map((row) => row.path)).toEqual(['01-balance-the-ledger.md']);
    expect(rows[0].language).toBeNull();
    expect(rows[0].content).toContain('Balance the ledger');
    store.close();
  });
});

describe('RON-372 import: re-import protects learner work', () => {
  it('RON-372 writes nothing when neither side changed', async () => {
    const cwd = mkCourseCwd();
    const store = mkStore();
    await planAndApply(cwd, store);
    const before = await filesOf(store, lessonId('ron-372-exercises', 1));

    const { stats } = await planAndApply(cwd, store);
    const after = await filesOf(store, lessonId('ron-372-exercises', 1));

    expect(stats.exerciseFiles.filter((file) => file.action === 'kept')).toHaveLength(2);
    expect(after[0].updated_at).toBe(before[0].updated_at);
    store.close();
  });

  it('RON-372 updates an untouched file when the source changed', async () => {
    const cwd = mkCourseCwd();
    const store = mkStore();
    await planAndApply(cwd, store);

    const source = join(cwd, 'learning', 'ron-372-exercises', 'exercises', '02-warm-up.py');
    writeFileSync(source, '# Warm up v2\nprint("3.4")\n');
    const { stats } = await planAndApply(cwd, store);

    const rows = await filesOf(store, lessonId('ron-372-exercises', 2));
    expect(rows[0].content).toContain('Warm up v2');
    expect(rows[0].imported_hash).toBe(contentHash(rows[0].content));
    expect(stats.exerciseFiles.find((file) => file.path === '02-warm-up.py')).toMatchObject({
      action: 'updated',
    });
    store.close();
  });

  it('RON-372 keeps the learner version of an edited file and reports it', async () => {
    const cwd = mkCourseCwd();
    const store = mkStore();
    await planAndApply(cwd, store);
    useAdapter(store);
    await saveWorkspaceFile({
      courseId: 'cli-course-ron-372-exercises',
      lessonId: lessonId('ron-372-exercises', 2),
      path: '02-warm-up.py',
      language: 'python',
      content: '# my own answer\nprint("3.3")\n',
    });

    const source = join(cwd, 'learning', 'ron-372-exercises', 'exercises', '02-warm-up.py');
    writeFileSync(source, '# Warm up v2\nprint("3.4")\n');
    const { stats } = await planAndApply(cwd, store);

    const rows = await filesOf(store, lessonId('ron-372-exercises', 2));
    expect(rows[0].content).toBe('# my own answer\nprint("3.3")\n');
    expect(stats.exerciseFiles.find((file) => file.path === '02-warm-up.py')).toMatchObject({
      action: 'kept',
      reason: 'edited',
    });
    store.close();
  });

  it('RON-372 keeps a same-name file it never wrote (no ledger)', async () => {
    const cwd = mkCourseCwd();
    const store = mkStore();
    useAdapter(store);
    await saveWorkspaceFile({
      courseId: 'cli-course-ron-372-exercises',
      lessonId: lessonId('ron-372-exercises', 1),
      path: '01-project-anatomy-and-auto-configuration.java',
      language: 'java',
      content: 'class Mine {}\n',
    });

    const { stats } = await planAndApply(cwd, store);
    const rows = await filesOf(store, lessonId('ron-372-exercises', 1));
    expect(rows[0].content).toBe('class Mine {}\n');
    expect(stats.exerciseFiles.find((file) => file.kind === 'exercise')).toMatchObject({
      action: 'kept',
      reason: 'not-empty',
    });
    store.close();
  });

  it('RON-372 inserts a file added to the course later without touching the others', async () => {
    const cwd = mkCourseCwd();
    const store = mkStore();
    await planAndApply(cwd, store);
    const lessonOneBefore = await filesOf(store, lessonId('ron-372-exercises', 1));

    const courseMd = join(cwd, 'learning', 'ron-372-exercises', 'COURSE.md');
    const section = readFileSync(courseMd, 'utf-8').replace(
      '| 2 | **Warm up** | ⬜ Not started |',
      '| 2 | **Warm up** | ⬜ Not started |\n| 3 | **Loops** | ⬜ Not started |'
    );
    writeFileSync(courseMd, section);
    writeFileSync(
      join(cwd, 'learning', 'ron-372-exercises', 'exercises', '03-loop.py'),
      'for n in range(3):\n    print(n)\n'
    );

    const { stats } = await planAndApply(cwd, store);
    const added = stats.exerciseFiles.find((file) => file.path === '03-loop.py');
    expect(added).toMatchObject({ action: 'new', lessonPosition: 3 });

    const lessonThree = await filesOf(store, lessonId('ron-372-exercises', 3));
    expect(lessonThree.map((row) => row.path)).toEqual(['03-loop.py']);

    const lessonOneAfter = await filesOf(store, lessonId('ron-372-exercises', 1));
    expect(lessonOneAfter[0].updated_at).toBe(lessonOneBefore[0].updated_at);
    store.close();
  });

  it('RON-372 never removes a file whose source exercise disappeared', async () => {
    const cwd = mkCourseCwd();
    const store = mkStore();
    await planAndApply(cwd, store);
    rmSync(join(cwd, 'learning', 'ron-372-exercises', 'exercises', '02-warm-up.py'));

    await planAndApply(cwd, store);
    const rows = await filesOf(store, lessonId('ron-372-exercises', 2));
    expect(rows.map((row) => row.path)).toEqual(['02-warm-up.py']);
    store.close();
  });
});

describe('RON-372 import: the empty seed Studio wrote first', () => {
  it('RON-372 clears the blank main.ext and the exercise becomes the only file', async () => {
    const cwd = mkCourseCwd();
    const store = mkStore();
    useAdapter(store);
    const seeded = await saveWorkspaceFile({
      courseId: 'cli-course-ron-372-exercises',
      lessonId: lessonId('ron-372-exercises', 1),
      path: 'main.java',
      language: 'java',
      content: '',
    });

    const { stats } = await planAndApply(cwd, store);
    const rows = await filesOf(store, lessonId('ron-372-exercises', 1));
    expect(rows.map((row) => row.path)).toEqual(['01-project-anatomy-and-auto-configuration.java']);
    expect(stats.exerciseFiles.find((file) => file.path === 'main.java')).toMatchObject({
      action: 'removed',
      reason: 'empty-seed',
    });

    const tombstones = await store.list('workspace_files', {
      where: { lesson_id: lessonId('ron-372-exercises', 1) },
      includeDeleted: true,
    });
    expect(tombstones.find((row) => row.id === seeded.id).deleted_at).toBeTruthy();
    store.close();
  });

  it('RON-372 keeps an empty seed that has a run result and reports why', async () => {
    const cwd = mkCourseCwd();
    const store = mkStore();
    useAdapter(store);
    const seeded = await saveWorkspaceFile({
      courseId: 'cli-course-ron-372-exercises',
      lessonId: lessonId('ron-372-exercises', 1),
      path: 'main.java',
      language: 'java',
      content: '',
    });
    await saveRunResult({ lessonId: lessonId('ron-372-exercises', 1), fileId: seeded.id, stdout: 'ok' });

    const { stats } = await planAndApply(cwd, store);
    const rows = await filesOf(store, lessonId('ron-372-exercises', 1));
    expect(rows.map((row) => row.path).sort()).toEqual([
      '01-project-anatomy-and-auto-configuration.java',
      'main.java',
    ]);
    expect(stats.exerciseFiles.find((file) => file.path === 'main.java')).toMatchObject({
      action: 'kept',
      reason: 'has-runs',
    });
    store.close();
  });

  it('RON-372 keeps a non-empty file and reports it', async () => {
    const cwd = mkCourseCwd();
    const store = mkStore();
    useAdapter(store);
    await saveWorkspaceFile({
      courseId: 'cli-course-ron-372-exercises',
      lessonId: lessonId('ron-372-exercises', 1),
      path: 'notes.js',
      language: 'javascript',
      content: 'console.log("scratch");\n',
    });

    const { stats } = await planAndApply(cwd, store);
    const rows = await filesOf(store, lessonId('ron-372-exercises', 1));
    expect(rows.map((row) => row.path)).toContain('notes.js');
    expect(stats.exerciseFiles.find((file) => file.path === 'notes.js')).toMatchObject({
      action: 'kept',
      reason: 'not-empty',
    });
    store.close();
  });

  it('RON-372 leaves lessons without exercise files untouched', async () => {
    const store = mkStore();
    useAdapter(store);
    await saveWorkspaceFile({
      courseId: 'cli-course-ron-372-exercises',
      lessonId: lessonId('ron-372-exercises', 9),
      path: 'main.js',
      language: 'javascript',
      content: '',
    });
    const cwd = mkCourseCwd();

    const { stats } = await planAndApply(cwd, store);
    const rows = await filesOf(store, lessonId('ron-372-exercises', 9));
    expect(rows.map((row) => row.path)).toEqual(['main.js']);
    expect(stats.exerciseFiles.some((file) => file.lessonId === lessonId('ron-372-exercises', 9))).toBe(false);
    store.close();
  });
});

describe('RON-372 import: dry-run and summary', () => {
  it('RON-372 dry-run lists files per lesson and writes nothing', async () => {
    const cwd = mkCourseCwd();
    const store = mkStore();
    useAdapter(store);
    await saveWorkspaceFile({
      courseId: 'cli-course-ron-372-exercises',
      lessonId: lessonId('ron-372-exercises', 1),
      path: 'main.java',
      language: 'java',
      content: '',
    });

    const logs = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      const result = await run({ args: ['--all', '--dry-run'], cwd, store, style: (type, message) => message });
      expect(result.totals.exerciseCount).toBe(2);
    } finally {
      console.log = original;
    }

    const output = logs.join('\n');
    expect(output).toContain('01-project-anatomy-and-auto-configuration.java (new)');
    expect(output).toContain('02-warm-up.py (new)');
    expect(output).toContain('main.java (would remove)');
    expect(output).toContain('2 exercise files');

    const rows = await store.list('workspace_files', { includeDeleted: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).toBeNull();
    store.close();
  });

  it('RON-372 summary counts the exercise files and the run reports kept rows', async () => {
    const cwd = mkCourseCwd();
    const store = mkStore();
    await planAndApply(cwd, store);
    useAdapter(store);
    await saveWorkspaceFile({
      courseId: 'cli-course-ron-372-exercises',
      lessonId: lessonId('ron-372-exercises', 1),
      path: '01-project-anatomy-and-auto-configuration.java',
      language: 'java',
      content: 'class MyAnswer {}\n',
    });

    const logs = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      const result = await run({ args: ['--all'], cwd, store, style: (type, message) => message });
      expect(result.totals.exerciseCount).toBe(2);
    } finally {
      console.log = original;
    }

    const output = logs.join('\n');
    expect(output).toContain('2 exercise files');
    expect(output).toContain('kept your version of 01-project-anatomy-and-auto-configuration.java');
    expect(output).toContain('Imported 1 course');
    store.close();
  });
});
