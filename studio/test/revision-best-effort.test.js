/**
 * Wave-0 contract for D-16/D-17 best-effort emission.
 *
 * A failing `learning_events` or `revision_links` write must never reject the learner's action: the
 * primary row is saved first, then the event/link write is opportunistic. Validation stays strict —
 * `recordEvent` itself still throws on invalid meta, so the privacy guards keep failing loudly.
 *
 * Every link case SEEDS the feedback row it points at: `maybeLinkRevision` resolves the explicit
 * feedback row first and returns before any `revision_links` put when the id does not resolve, so an
 * unresolvable id would make the test pass without ever exercising the swallowed failure.
 *
 * This file currently fails on assertions (the wrappers do not exist yet) — the intended red signal.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';

/**
 * A memory adapter whose writes fail for one table at a time. The same instance is seeded while
 * healthy, then armed, so seed and assertion run against one dataset.
 */
function failingAdapter() {
  const base = createMemoryAdapter();
  const state = { failTable: null };
  return {
    adapter: {
      ...base,
      async put(table, row) {
        if (state.failTable === table) throw new Error('metrics down');
        return base.put(table, row);
      },
    },
    fail(table) {
      state.failTable = table;
    },
    heal() {
      state.failTable = null;
    },
  };
}

const reviewContent = (surface) =>
  JSON.stringify({
    surface,
    attemptTable: surface === 'quiz' ? 'quiz_attempts' : 'chat_messages',
    attemptId: null,
    passing: false,
    criteria: [{ key: 'q1', label: 'Criterion', status: 'not_met', question: 'Why?' }],
  });

let failing;

async function seedLesson() {
  const course = await repo.createCourse({ title: 'C', lessons: [{ title: 'L1' }] });
  return course.lessons[0];
}

beforeEach(() => {
  failing = failingAdapter();
  repo.useAdapter(failing.adapter);
});

describe('best-effort event emission', () => {
  it('a failing learning_events write leaves the quiz attempt saved', async () => {
    const lesson = await seedLesson();
    failing.fail('learning_events');

    const row = await repo.saveQuizAttempt(lesson.id, { questions: [], answers: [0], score: 1, total: 1 });

    expect(row.id).toBeTruthy();
    expect(await repo.listQuizAttempts(lesson.id)).toHaveLength(1);
  });

  it('a failing learning_events write leaves the tutor chat message saved', async () => {
    const lesson = await seedLesson();
    failing.fail('learning_events');

    const row = await repo.appendChat(lesson.id, { role: 'user', mode: 'check_answer', content: 'x' });

    expect(row.id).toBeTruthy();
    expect(await repo.listChat(lesson.id)).toHaveLength(1);
  });

  it('a failing learning_events write leaves the workspace run saved', async () => {
    const lesson = await seedLesson();
    failing.fail('learning_events');

    const row = await repo.saveRunResult({
      lessonId: lesson.id,
      fileId: 'f1',
      checks: [{ name: 'a', passed: true }],
    });

    expect(row.id).toBeTruthy();
    expect(await repo.listRunResults(lesson.id)).toHaveLength(1);
  });

  it('a failing learning_events write leaves the capstone submission saved', async () => {
    const course = await repo.createCourse({ title: 'C', lessons: [{ title: 'L1' }] });
    const capstone = await repo.createCapstone({ courseId: course.id });
    failing.fail('learning_events');

    const row = await repo.createCapstoneSubmission({ capstoneId: capstone.id });

    expect(row.attempt).toBe(1);
    expect(await repo.listCapstoneSubmissions(capstone.id)).toHaveLength(1);
  });
});

describe('best-effort revision links', () => {
  it('a failing revision_links write leaves the quiz attempt saved', async () => {
    const lesson = await seedLesson();
    const review = await repo.appendChat(lesson.id, {
      role: 'assistant',
      mode: 'review',
      content: reviewContent('quiz'),
    });

    failing.fail('revision_links');

    const row = await repo.saveQuizAttempt(lesson.id, {
      questions: [],
      answers: [0],
      score: 1,
      total: 1,
      revisionOf: { feedbackTable: 'chat_messages', feedbackId: review.id },
    });

    expect(row.id).toBeTruthy();
    expect(await repo.listQuizAttempts(lesson.id)).toHaveLength(1);
    expect(await repo.listRevisionLinks({ lessonId: lesson.id, revisedId: row.id })).toHaveLength(0);
  });

  it('a failing revision_links write leaves the tutor chat message saved', async () => {
    const lesson = await seedLesson();
    const review = await repo.appendChat(lesson.id, {
      role: 'assistant',
      mode: 'review',
      content: reviewContent('tutor'),
    });

    failing.fail('revision_links');

    await repo.appendChat(lesson.id, {
      role: 'user',
      mode: 'check_answer',
      content: 'v2',
      revisionOf: { feedbackTable: 'chat_messages', feedbackId: review.id },
    });

    expect(await repo.listChat(lesson.id)).toHaveLength(2);
    expect(await repo.listRevisionLinks({ lessonId: lesson.id })).toHaveLength(0);
  });

  it('a failing revision_links write leaves the workspace run saved', async () => {
    const lesson = await seedLesson();
    const first = await repo.saveRunResult({
      lessonId: lesson.id,
      fileId: 'f1',
      checks: [{ name: 'a', passed: true }],
    });

    failing.fail('revision_links');

    const second = await repo.saveRunResult({
      lessonId: lesson.id,
      fileId: 'f1',
      checks: [{ name: 'a', passed: false }],
      revisionOf: { feedbackTable: 'run_results', feedbackId: first.id },
    });

    expect(second.id).toBeTruthy();
    expect(await repo.listRunResults(lesson.id)).toHaveLength(2);
    expect(await repo.listRevisionLinks({ lessonId: lesson.id, revisedId: second.id })).toHaveLength(0);
  });

  it('a failing revision_links write leaves the capstone submission saved', async () => {
    const course = await repo.createCourse({ title: 'C', lessons: [{ title: 'L1' }] });
    const capstone = await repo.createCapstone({ courseId: course.id });
    const first = await repo.createCapstoneSubmission({ capstoneId: capstone.id });

    failing.fail('revision_links');

    const second = await repo.createCapstoneSubmission({
      capstoneId: capstone.id,
      revisionOf: { feedbackTable: 'capstone_submissions', feedbackId: first.id },
    });

    expect(second.attempt).toBe(2);
    expect(await repo.listCapstoneSubmissions(capstone.id)).toHaveLength(2);
    expect(await repo.listRevisionLinks({ revisedId: second.id })).toHaveLength(0);
  });
});

describe('strict validation stays loud', () => {
  it('recordEvent still rejects invalid meta loudly', async () => {
    failing.heal();

    await expect(
      repo.recordEvent({ kind: 'quiz_completed', surface: 'quiz', meta: { note: 'nope' } })
    ).rejects.toThrow();
    expect(await repo.listEvents()).toHaveLength(0);
  });
});
