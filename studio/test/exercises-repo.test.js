/**
 * @vitest-environment node
 *
 * RON-266 — exercises and attempts through the repository API, in every adapter.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import { createIdbAdapter } from '../src/lib/repo/idb-adapter.js';
import * as repo from '../src/lib/repo/index.js';

const SPEC = {
  version: 1,
  type: 'journal-entry',
  id: 'l1-e1',
  prompt: '商品 50,000 円を現金で売り上げた。',
  promptGloss: 'Sold goods for ¥50,000 in cash.',
  accounts: ['現金', '売上', '普通預金', '仕入', '売掛金', '買掛金'].map((name) => ({
    name,
    gloss: `gloss-${name}`,
  })),
  answer: {
    debit: [{ account: '現金', amount: 50000 }],
    credit: [{ account: '売上', amount: 50000 }],
  },
  hints: ['h1', 'h2', 'h3'],
};

const RESULT = {
  correct: true,
  balanced: true,
  totals: { debit: 50000, credit: 50000 },
  issues: [],
  sideIssues: { debit: null, credit: null },
  codes: [],
};

const ROWS = {
  debit: [{ account: '現金', amount: 50000 }],
  credit: [{ account: '売上', amount: 50000 }],
};

let dbCounter = 0;

async function makeCourseWithExercise() {
  const course = await repo.createCourse({
    title: 'Boki',
    kind: 'skill',
    externalId: 'template:boki-journal-3',
    lessons: [{ title: '現金・預金', content_md: '# L1' }],
  });
  const lesson = course.lessons[0];
  const exercise = await repo.createExercise({
    courseId: course.id,
    lessonId: lesson.id,
    position: 1,
    type: 'journal-entry',
    spec: SPEC,
    externalId: 'template:boki-journal-3:1:l1-e1',
  });
  return { course, lesson, exercise };
}

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
});

describe('RON-266 repo: exercises', () => {
  it('stores a course external id and decoded exercises in position order', async () => {
    const { course, lesson, exercise } = await makeCourseWithExercise();
    const second = await repo.createExercise({
      courseId: course.id,
      lessonId: lesson.id,
      position: 2,
      type: 'journal-entry',
      spec: { ...SPEC, id: 'l1-e2' },
    });

    expect((await repo.getCourse(course.id)).external_id).toBe('template:boki-journal-3');
    const listed = await repo.listLessonExercises(lesson.id);
    expect(listed.map((row) => row.id)).toEqual([exercise.id, second.id]);
    expect(listed[0].spec.answer.debit[0]).toEqual({ account: '現金', amount: 50000 });
    expect(listed[0].spec_json).toBeUndefined();
    expect(listed[0].external_id).toBe('template:boki-journal-3:1:l1-e1');

    const grouped = await repo.listCourseExercises(course.id);
    expect(Object.keys(grouped)).toEqual([lesson.id]);
    expect(grouped[lesson.id]).toHaveLength(2);
  });

  it('refuses an invalid spec instead of storing it', async () => {
    const course = await repo.createCourse({ title: 'Boki', lessons: [{ title: 'L1' }] });
    await expect(
      repo.createExercise({
        courseId: course.id,
        lessonId: course.lessons[0].id,
        spec: { ...SPEC, hints: [] },
      })
    ).rejects.toThrow();
  });

  it('cascades exercises and attempts when a course is deleted', async () => {
    const { course, lesson, exercise } = await makeCourseWithExercise();
    await repo.saveExerciseAttempt(exercise.id, { lessonId: lesson.id, rows: ROWS, result: RESULT });

    await repo.deleteCourse(course.id);

    expect(await repo.listLessonExercises(lesson.id)).toEqual([]);
    expect(await repo.listExerciseAttempts(exercise.id)).toEqual([]);
  });
});

describe('RON-266 repo: attempts', () => {
  it('RON-266 repo: a checked attempt stores its rows and result', async () => {
    const { lesson, exercise } = await makeCourseWithExercise();
    const attempt = await repo.saveExerciseAttempt(exercise.id, {
      lessonId: lesson.id,
      rows: ROWS,
      result: RESULT,
    });

    expect(attempt.exercise_id).toBe(exercise.id);
    expect(attempt.lesson_id).toBe(lesson.id);
    expect(attempt.rows).toEqual(ROWS);
    expect(attempt.result).toEqual(RESULT);
    expect(attempt.correct).toBe(true);
    expect(typeof attempt.correct).toBe('boolean');
  });

  it('RON-266 repo: attempts are listed chronologically after a reload', async () => {
    const { exercise } = await makeCourseWithExercise();
    const first = await repo.saveExerciseAttempt(exercise.id, { rows: ROWS, result: { ...RESULT, correct: false } });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await repo.saveExerciseAttempt(exercise.id, { rows: ROWS, result: RESULT });

    const listed = await repo.listExerciseAttempts(exercise.id);
    expect(listed.map((row) => row.id)).toEqual([first.id, second.id]);
    expect(listed.map((row) => row.correct)).toEqual([false, true]);
  });

  it('refuses an attempt for an unknown exercise', async () => {
    await expect(repo.saveExerciseAttempt('missing', { rows: ROWS, result: RESULT })).rejects.toThrow();
  });
});

describe('RON-266 repo: adapter parity', () => {
  it('RON-266 repo: idb, memory and sqlite return the same attempt', async () => {
    const adapters = [
      createMemoryAdapter(),
      createIdbAdapter({ dbName: `ron-266-parity-${++dbCounter}` }),
    ];

    for (const adapter of adapters) {
      repo.useAdapter(adapter);
      const { lesson, exercise } = await makeCourseWithExercise();
      await repo.saveExerciseAttempt(exercise.id, { lessonId: lesson.id, rows: ROWS, result: RESULT });
      const [attempt] = await repo.listExerciseAttempts(exercise.id);
      expect(attempt.rows).toEqual(ROWS);
      expect(attempt.result.correct).toBe(true);
      expect(attempt.correct).toBe(true);
      expect((await repo.listLessonExercises(lesson.id))[0].spec.type).toBe('journal-entry');
    }
    repo.useAdapter(createMemoryAdapter());
  });
});
