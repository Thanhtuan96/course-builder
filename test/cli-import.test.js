/**
 * @vitest-environment node
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { readCourse } from '../bin/course-reader.js';
import { createStudioStore } from '../bin/studio-store.js';
import { planCourseImport, applyCourseImport, run } from '../bin/commands/import.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'courses', 'flavour-table');

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  tempDirs.length = 0;
});

function mkTemp(prefix = 'cp-import-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** A cwd with `learning/flavour-table` copied from the shared fixtures. */
function mkCourseCwd() {
  const cwd = mkTemp();
  mkdirSync(join(cwd, 'learning'), { recursive: true });
  cpSync(FIXTURE, join(cwd, 'learning', 'flavour-table'), { recursive: true });
  return cwd;
}

function mkStore() {
  const home = mkTemp('cp-import-db-');
  return createStudioStore({ dbPath: join(home, 'professor.db'), log: () => {} });
}

describe('planCourseImport', () => {
  const course = readCourse(FIXTURE, { slug: 'flavour-table', today: '2026-10-15' });

  it('maps sections, lectures, cards and logs deterministically', () => {
    const plan = planCourseImport(course, { now: Date.parse('2026-10-15T12:00:00Z') });
    expect(plan.course).toMatchObject({ id: 'cli-course-flavour-table', externalId: 'cli:flavour-table', kind: 'conceptual' });
    expect(plan.lessons.map((l) => l.title)).toEqual(['First Steps', 'Second Steps', 'Third Steps']);
    expect(plan.lessons[0].status).toBe('done');
    expect(plan.lessons[0].lectures.map((l) => l.filename)).toEqual(['01-first-steps.md']);
    expect(plan.lessons[1].lectures.map((l) => l.filename)).toEqual(['LECTURE.md']);
    expect(plan.cards).toHaveLength(2);
    expect(plan.cards[0]).toMatchObject({ externalId: 'cli:flavour-table:card:1', due_at: '2026-10-15T00:00:00.000Z' });
    expect(plan.cards[1].due_at).toBe('2026-11-01T00:00:00.000Z');
    expect(plan.logs).toHaveLength(1);
    expect(plan.logs[0]).toMatchObject({ kind: 'reflection', lessonId: 'cli-lesson-flavour-table-1' });
  });
});

describe('planCourseImport log mapping', () => {
  it('routes scored entries to quiz attempts, matched sections to reflections, and the rest to notes', () => {
    const dir = mkTemp();
    writeFileSync(join(dir, 'COURSE.md'), '# Course: Synthetic\n**Goal**: Ship something real\n');
    const course = {
      slug: 'synthetic',
      dir,
      title: 'Synthetic',
      level: 'Beginner',
      kind: 'programming',
      sections: [{ n: '1', title: 'Alpha', status: 'done', completedAt: '2026-10-01' }],
      currentSection: { n: '1', title: 'Alpha', status: 'done' },
      cards: [],
      log: [
        { date: '2026-10-02', section: 'Alpha', verdict: 'scored 4/5' },
        { date: '2026-10-03', section: 'Section 1 — Alpha', verdict: 'solid' },
        { date: '2026-10-04', section: 'Unknown topic', verdict: 'reviewed' },
      ],
    };
    const plan = planCourseImport(course);
    expect(plan.course.goal).toBe('Ship something real');
    expect(plan.logs.map((l) => l.kind)).toEqual(['quiz', 'reflection', 'note']);
    expect(plan.logs[0]).toMatchObject({ score: 4, total: 5, lessonId: 'cli-lesson-synthetic-1' });
    expect(plan.logs[1].lessonId).toBe('cli-lesson-synthetic-1');
    expect(plan.logs[2].lessonId).toBeNull();
  });
});

describe('applyCourseImport', () => {
  it('dry-run writes nothing', async () => {
    const store = mkStore();
    const course = readCourse(FIXTURE, { slug: 'flavour-table' });
    const stats = await applyCourseImport(planCourseImport(course), store, { dryRun: true });
    expect(stats).toMatchObject({ lessons: 3, versions: 2, cards: 2, reflections: 1 });
    expect(await store.list('courses')).toHaveLength(0);
    expect(await store.list('lessons')).toHaveLength(0);
    store.close();
  });

  it('imports courses/lessons/versions/cards/reflections and is idempotent', async () => {
    const store = mkStore();
    const course = readCourse(FIXTURE, { slug: 'flavour-table' });
    const plan = planCourseImport(course);

    await applyCourseImport(plan, store);
    await applyCourseImport(plan, store); // re-run must not duplicate

    expect(await store.list('courses')).toHaveLength(1);
    expect(await store.list('lessons')).toHaveLength(3);
    expect(await store.list('lesson_versions')).toHaveLength(2);
    expect(await store.list('cards')).toHaveLength(2);
    expect(await store.list('reflections')).toHaveLength(1);

    const storedCourse = await store.get('courses', 'cli-course-flavour-table');
    expect(storedCourse).toMatchObject({ source: 'cli', external_id: 'cli:flavour-table' });

    const lessons = await store.list('lessons', { where: { course_id: 'cli-course-flavour-table' }, orderBy: 'position' });
    expect(lessons.map((l) => l.status)).toEqual(['done', 'active', 'todo']);
    expect(lessons.every((l) => l.external_id)).toBe(true);

    const cards = await store.list('cards', { orderBy: 'due_at' });
    expect(cards.map((c) => c.due_at)).toEqual(['2026-10-15T00:00:00.000Z', '2026-11-01T00:00:00.000Z']);
    store.close();
  });
});

describe('import run (CLI)', () => {
  it('imports every course from cwd and summarises', async () => {
    const cwd = mkCourseCwd();
    const store = mkStore();
    const logs = [];
    const original = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    try {
      const result = await run({ args: ['--all'], cwd, store, style: (t, m) => m });
      expect(result.courses).toBe(1);
      expect(result.totals).toMatchObject({ lessons: 3, versions: 2, cards: 2 });
    } finally {
      console.log = original;
    }
    expect(await store.list('courses')).toHaveLength(1);
    expect(logs.join('\n')).toContain('Imported 1 course');
    store.close();
  });

  it('errors for an unknown slug', async () => {
    const cwd = mkCourseCwd();
    const store = mkStore();
    const prev = process.exitCode;
    process.exitCode = 0;
    try {
      const result = await run({ args: ['does-not-exist'], cwd, store, style: (t, m) => m });
      expect(result.error).toMatch(/not found/);
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = prev;
      store.close();
    }
  });
});
