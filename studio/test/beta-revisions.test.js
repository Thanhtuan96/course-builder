import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';

const BASE = '2026-10-20T09:00:00.000Z';
const HOUR = 60 * 60 * 1000;

let adapter;

beforeEach(() => {
  adapter = createMemoryAdapter();
  repo.useAdapter(adapter);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(BASE));
});

afterEach(() => {
  vi.useRealTimers();
});

async function seedLesson() {
  const course = await repo.createCourse({ title: 'Revision course', lessons: [{ title: 'L1' }] });
  return { course, lesson: course.lessons[0] };
}

function at(offsetMs) {
  return new Date(Date.parse(BASE) + offsetMs).toISOString();
}

async function putRow(table, row) {
  return adapter.put(table, {
    owner_id: 'local',
    updated_at: row.created_at,
    deleted_at: null,
    ...row,
  });
}

async function seedQuizAttemptFixture(lessonId, { id, createdAt }) {
  return putRow('quiz_attempts', {
    id,
    lesson_id: lessonId,
    questions_json: '[]',
    answers_json: '[]',
    score: 1,
    total: 2,
    created_at: createdAt,
  });
}

async function seedChatFixture(lessonId, { id, role = 'assistant', mode = null, createdAt, content = 'feedback' }) {
  return putRow('chat_messages', {
    id,
    lesson_id: lessonId,
    role,
    mode,
    content,
    created_at: createdAt,
  });
}

async function seedRunFixture(lessonId, { id, fileId = null, createdAt, checks }) {
  return putRow('run_results', {
    id,
    lesson_id: lessonId,
    file_id: fileId,
    runner: 'browser',
    language: 'javascript',
    stdout: '',
    stderr: '',
    exit_code: null,
    checks_json: JSON.stringify(checks),
    duration_ms: null,
    created_at: createdAt,
  });
}

async function seedCapstoneSubmissionFixture(capstoneId, { id, attempt = 1, createdAt, review = null, verdict = null }) {
  return putRow('capstone_submissions', {
    id,
    capstone_id: capstoneId,
    attempt,
    content_md: 'submission',
    repo_url: null,
    files_json: null,
    test_results_json: null,
    review_json: review == null ? null : JSON.stringify(review),
    verdict,
    external_id: null,
    created_at: createdAt,
  });
}

describe('beta revisions: explicit links', () => {
  it('stores exactly one explicit link for a quiz attempt with revisionOf', async () => {
    const { course, lesson } = await seedLesson();
    const first = await repo.saveQuizAttempt(lesson.id, {
      questions: [{ id: 'q1' }],
      answers: [0],
      score: 1,
      total: 1,
    });

    vi.setSystemTime(new Date(at(HOUR)));
    const review = await repo.appendChat(lesson.id, {
      role: 'assistant',
      content: 'Try again with the edge case.',
      mode: 'review',
    });

    vi.setSystemTime(new Date(at(2 * HOUR)));
    const second = await repo.saveQuizAttempt(lesson.id, {
      questions: [{ id: 'q1' }],
      answers: [1],
      score: 1,
      total: 1,
      revisionOf: { feedbackTable: 'chat_messages', feedbackId: review.id },
    });

    const links = await repo.listRevisionLinks({ lessonId: lesson.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      surface: 'quiz',
      course_id: course.id,
      lesson_id: lesson.id,
      attempt_table: 'quiz_attempts',
      attempt_id: first.id,
      feedback_table: 'chat_messages',
      feedback_id: review.id,
      revised_table: 'quiz_attempts',
      revised_id: second.id,
      link_kind: 'explicit',
      deleted_at: null,
    });

    expect(await repo.listRevisionLinks({ lessonId: lesson.id, linkKind: 'explicit' })).toHaveLength(1);
  });

  it('saves the attempt without a link when the explicit feedback row is missing', async () => {
    const { lesson } = await seedLesson();
    const attempt = await repo.saveQuizAttempt(lesson.id, {
      questions: [],
      answers: [0],
      score: 0,
      total: 1,
      revisionOf: { feedbackTable: 'chat_messages', feedbackId: 'missing-feedback' },
    });

    expect(attempt.id).toBeTruthy();
    expect(await repo.listQuizAttempts(lesson.id)).toHaveLength(1);
    expect(await repo.listRevisionLinks({ lessonId: lesson.id })).toHaveLength(0);
    expect(await repo.listEvents({ kind: 'quiz_completed' })).toHaveLength(1);
  });
});

describe('beta revisions: inferred links per surface', () => {
  it('infers a quiz revision from a prior attempt and a later mode-review assistant message', async () => {
    const { course, lesson } = await seedLesson();
    const prior = await seedQuizAttemptFixture(lesson.id, { id: 'quiz-prior', createdAt: at(-HOUR) });
    const feedback = await seedChatFixture(lesson.id, {
      id: 'review-1',
      mode: 'review',
      createdAt: at(-30 * 60 * 1000),
    });

    vi.setSystemTime(new Date(BASE));
    const revised = await repo.saveQuizAttempt(lesson.id, { questions: [], answers: [1], score: 2, total: 2 });

    const links = await repo.listRevisionLinks({ lessonId: lesson.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      surface: 'quiz',
      course_id: course.id,
      lesson_id: lesson.id,
      attempt_table: 'quiz_attempts',
      attempt_id: prior.id,
      feedback_table: 'chat_messages',
      feedback_id: feedback.id,
      revised_table: 'quiz_attempts',
      revised_id: revised.id,
      link_kind: 'inferred',
    });
  });

  it('infers a tutor revision from a prior user turn and a later assistant turn', async () => {
    const { course, lesson } = await seedLesson();
    const prior = await seedChatFixture(lesson.id, {
      id: 'user-prior',
      role: 'user',
      mode: 'check_answer',
      createdAt: at(-HOUR),
    });
    const feedback = await seedChatFixture(lesson.id, {
      id: 'assistant-feedback',
      role: 'assistant',
      createdAt: at(-30 * 60 * 1000),
    });

    vi.setSystemTime(new Date(BASE));
    const revised = await repo.appendChat(lesson.id, { role: 'user', content: 'revised answer', mode: 'review' });

    const links = await repo.listRevisionLinks({ lessonId: lesson.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      surface: 'tutor',
      course_id: course.id,
      lesson_id: lesson.id,
      attempt_table: 'chat_messages',
      attempt_id: prior.id,
      feedback_table: 'chat_messages',
      feedback_id: feedback.id,
      revised_table: 'chat_messages',
      revised_id: revised.id,
      link_kind: 'inferred',
    });
  });

  it('infers a workspace revision from a prior failing run on the same lesson and file', async () => {
    const { course, lesson } = await seedLesson();
    const prior = await seedRunFixture(lesson.id, {
      id: 'run-prior',
      fileId: 'file-1',
      createdAt: at(-HOUR),
      checks: { checks: [{ passed: false }], snapshot: {} },
    });

    vi.setSystemTime(new Date(BASE));
    const revised = await repo.saveRunResult({ lessonId: lesson.id, fileId: 'file-1', checks: { checks: [{ passed: true }], snapshot: {} } });

    const links = await repo.listRevisionLinks({ lessonId: lesson.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      surface: 'workspace',
      course_id: course.id,
      lesson_id: lesson.id,
      attempt_table: 'run_results',
      attempt_id: prior.id,
      feedback_table: 'run_results',
      feedback_id: prior.id,
      revised_table: 'run_results',
      revised_id: revised.id,
      link_kind: 'inferred',
    });
  });

  it('infers a capstone revision from a prior submission with a verdict', async () => {
    const { course } = await seedLesson();
    const capstone = await repo.createCapstone({ courseId: course.id, brief_md: 'brief' });
    const prior = await seedCapstoneSubmissionFixture(capstone.id, {
      id: 'submission-prior',
      createdAt: at(-HOUR),
      verdict: 'fail',
    });

    vi.setSystemTime(new Date(BASE));
    const revised = await repo.createCapstoneSubmission({ capstoneId: capstone.id, content_md: 'second attempt' });

    const links = await repo.listRevisionLinks({ courseId: course.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      surface: 'capstone',
      course_id: course.id,
      lesson_id: null,
      attempt_table: 'capstone_submissions',
      attempt_id: prior.id,
      feedback_table: 'capstone_submissions',
      feedback_id: prior.id,
      revised_table: 'capstone_submissions',
      revised_id: revised.id,
      link_kind: 'inferred',
    });
  });

  it('links at exactly 72 hours and rejects 72 hours plus one second', async () => {
    const { lesson } = await seedLesson();
    const windowMs = 72 * HOUR;
    const prior = await seedQuizAttemptFixture(lesson.id, { id: 'quiz-exact', createdAt: at(-windowMs) });
    await seedChatFixture(lesson.id, { id: 'review-exact', mode: 'review', createdAt: at(-windowMs + HOUR) });

    vi.setSystemTime(new Date(BASE));
    const exact = await repo.saveQuizAttempt(lesson.id, { questions: [], answers: [0], score: 1, total: 1 });
    let links = await repo.listRevisionLinks({ lessonId: lesson.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ attempt_id: prior.id, revised_id: exact.id, link_kind: 'inferred' });

    const { lesson: lateLesson } = await seedLesson();
    await seedQuizAttemptFixture(lateLesson.id, { id: 'quiz-late', createdAt: at(-windowMs - 1000) });
    await seedChatFixture(lateLesson.id, { id: 'review-late', mode: 'review', createdAt: at(-windowMs + HOUR) });
    const late = await repo.saveQuizAttempt(lateLesson.id, { questions: [], answers: [0], score: 1, total: 1 });
    links = await repo.listRevisionLinks({ lessonId: lateLesson.id });
    expect(links).toHaveLength(0);
    expect(late.id).toBeTruthy();
  });

  it('compares absolute timestamps across UTC+7 and UTC-8 clocks, not calendar days', async () => {
    const { lesson } = await seedLesson();
    const prior = await seedQuizAttemptFixture(lesson.id, {
      id: 'quiz-utc-minus-8',
      createdAt: '2026-10-17T23:30:00.000-08:00',
    });
    await seedChatFixture(lesson.id, {
      id: 'review-utc-minus-8',
      mode: 'review',
      createdAt: '2026-10-18T01:00:00.000-08:00',
    });

    const newIso = '2026-10-20T06:00:00.000+07:00';
    vi.setSystemTime(new Date(newIso));
    const revised = await repo.saveQuizAttempt(lesson.id, { questions: [], answers: [0], score: 1, total: 1 });

    const links = await repo.listRevisionLinks({ lessonId: lesson.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ attempt_id: prior.id, revised_id: revised.id, link_kind: 'inferred' });
  });

  it('detects a failure in a bare-array workspace checks payload', async () => {
    const { lesson } = await seedLesson();
    const prior = await seedRunFixture(lesson.id, {
      id: 'run-bare-array',
      fileId: null,
      createdAt: at(-HOUR),
      checks: [{ ok: false }],
    });

    vi.setSystemTime(new Date(BASE));
    const revised = await repo.saveRunResult({ lessonId: lesson.id, checks: [{ ok: true }] });

    const links = await repo.listRevisionLinks({ lessonId: lesson.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ attempt_id: prior.id, revised_id: revised.id, link_kind: 'inferred' });
  });
});

describe('beta revisions: explicit links on every attempt-creating write', () => {
  it('stores an explicit tutor link from a supplied assistant feedback row', async () => {
    const { lesson } = await seedLesson();
    const prior = await seedChatFixture(lesson.id, {
      id: 'tutor-prior',
      role: 'user',
      mode: 'check_answer',
      createdAt: at(-HOUR),
    });
    const feedback = await seedChatFixture(lesson.id, {
      id: 'tutor-feedback',
      role: 'assistant',
      createdAt: at(-30 * 60 * 1000),
    });

    vi.setSystemTime(new Date(BASE));
    const revised = await repo.appendChat(lesson.id, {
      role: 'user',
      content: 'revised answer',
      mode: 'check_answer',
      revisionOf: { feedbackTable: 'chat_messages', feedbackId: feedback.id },
    });

    const links = await repo.listRevisionLinks({ lessonId: lesson.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      surface: 'tutor',
      attempt_id: prior.id,
      feedback_id: feedback.id,
      revised_id: revised.id,
      link_kind: 'explicit',
    });
  });

  it('stores an explicit workspace link from a supplied feedback row', async () => {
    const { lesson } = await seedLesson();
    const prior = await seedRunFixture(lesson.id, {
      id: 'workspace-prior',
      fileId: 'main.js',
      createdAt: at(-HOUR),
      checks: { checks: [{ passed: false }], snapshot: {} },
    });
    const feedback = await seedChatFixture(lesson.id, { id: 'workspace-feedback', createdAt: at(-30 * 60 * 1000) });

    vi.setSystemTime(new Date(BASE));
    const revised = await repo.saveRunResult({
      lessonId: lesson.id,
      fileId: 'main.js',
      checks: { checks: [{ passed: true }], snapshot: {} },
      revisionOf: { feedbackTable: 'chat_messages', feedbackId: feedback.id },
    });

    const links = await repo.listRevisionLinks({ lessonId: lesson.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      surface: 'workspace',
      attempt_id: prior.id,
      feedback_table: 'chat_messages',
      feedback_id: feedback.id,
      revised_id: revised.id,
      link_kind: 'explicit',
    });
  });

  it('stores an explicit capstone link from a supplied submission row', async () => {
    const { course } = await seedLesson();
    const capstone = await repo.createCapstone({ courseId: course.id, brief_md: 'brief' });
    const prior = await seedCapstoneSubmissionFixture(capstone.id, {
      id: 'capstone-prior',
      createdAt: at(-HOUR),
      review: { score: 2 },
    });

    vi.setSystemTime(new Date(BASE));
    const revised = await repo.createCapstoneSubmission({
      capstoneId: capstone.id,
      content_md: 'second attempt',
      revisionOf: { feedbackTable: 'capstone_submissions', feedbackId: prior.id },
    });

    const links = await repo.listRevisionLinks({ courseId: course.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      surface: 'capstone',
      attempt_id: prior.id,
      feedback_table: 'capstone_submissions',
      feedback_id: prior.id,
      revised_id: revised.id,
      link_kind: 'explicit',
    });
  });
});

describe('beta revisions: D-07 negative shapes', () => {
  it('creates no link across different lessons', async () => {
    const { lesson: lessonA } = await seedLesson();
    const { lesson: lessonB } = await seedLesson();
    await seedQuizAttemptFixture(lessonA.id, { id: 'quiz-other-lesson', createdAt: at(-HOUR) });
    await seedChatFixture(lessonA.id, { id: 'review-other-lesson', mode: 'review', createdAt: at(-30 * 60 * 1000) });

    vi.setSystemTime(new Date(BASE));
    await repo.saveQuizAttempt(lessonB.id, { questions: [], answers: [0], score: 1, total: 1 });

    expect(await repo.listRevisionLinks({ lessonId: lessonB.id })).toHaveLength(0);
  });

  it('creates no link across different capstones', async () => {
    const { course: courseA } = await seedLesson();
    const { course: courseB } = await seedLesson();
    const capstoneA = await repo.createCapstone({ courseId: courseA.id, brief_md: 'A' });
    const capstoneB = await repo.createCapstone({ courseId: courseB.id, brief_md: 'B' });
    await seedCapstoneSubmissionFixture(capstoneA.id, {
      id: 'submission-other-capstone',
      createdAt: at(-HOUR),
      verdict: 'pass',
    });

    vi.setSystemTime(new Date(BASE));
    const revised = await repo.createCapstoneSubmission({ capstoneId: capstoneB.id, content_md: 'B attempt' });

    expect(await repo.listRevisionLinks({ revisedId: revised.id })).toHaveLength(0);
  });

  it('creates no workspace link for a different file_id on the same lesson', async () => {
    const { lesson } = await seedLesson();
    await seedRunFixture(lesson.id, {
      id: 'workspace-other-file',
      fileId: 'file-1',
      createdAt: at(-HOUR),
      checks: { checks: [{ passed: false }], snapshot: {} },
    });

    vi.setSystemTime(new Date(BASE));
    await repo.saveRunResult({ lessonId: lesson.id, fileId: 'file-2', checks: [{ passed: true }] });

    expect(await repo.listRevisionLinks({ lessonId: lesson.id })).toHaveLength(0);
  });

  it('creates no link when the prior attempt has no feedback', async () => {
    const { lesson } = await seedLesson();
    await seedQuizAttemptFixture(lesson.id, { id: 'quiz-no-feedback', createdAt: at(-HOUR) });
    vi.setSystemTime(new Date(BASE));
    await repo.saveQuizAttempt(lesson.id, { questions: [], answers: [0], score: 1, total: 1 });
    expect(await repo.listRevisionLinks({ lessonId: lesson.id })).toHaveLength(0);

    const { lesson: workspaceLesson } = await seedLesson();
    await seedRunFixture(workspaceLesson.id, {
      id: 'workspace-passing-prior',
      fileId: 'main.js',
      createdAt: at(-HOUR),
      checks: [{ passed: true }],
    });
    await repo.saveRunResult({ lessonId: workspaceLesson.id, fileId: 'main.js', checks: [{ passed: true }] });
    expect(await repo.listRevisionLinks({ lessonId: workspaceLesson.id })).toHaveLength(0);

    const { course } = await seedLesson();
    const capstone = await repo.createCapstone({ courseId: course.id, brief_md: 'brief' });
    await seedCapstoneSubmissionFixture(capstone.id, {
      id: 'submission-no-feedback',
      createdAt: at(-HOUR),
    });
    await repo.createCapstoneSubmission({ capstoneId: capstone.id, content_md: 'attempt' });
    expect(await repo.listRevisionLinks({ courseId: course.id })).toHaveLength(0);
  });

  it('creates no link when feedback was created before the prior attempt', async () => {
    const { lesson } = await seedLesson();
    await seedQuizAttemptFixture(lesson.id, { id: 'quiz-after-feedback', createdAt: at(-HOUR) });
    await seedChatFixture(lesson.id, { id: 'review-before-prior', mode: 'review', createdAt: at(-2 * HOUR) });

    vi.setSystemTime(new Date(BASE));
    await repo.saveQuizAttempt(lesson.id, { questions: [], answers: [0], score: 1, total: 1 });

    expect(await repo.listRevisionLinks({ lessonId: lesson.id })).toHaveLength(0);
  });

  it('falls through to inference when an explicit feedback row is missing', async () => {
    const { lesson } = await seedLesson();
    const prior = await seedQuizAttemptFixture(lesson.id, { id: 'quiz-fallthrough', createdAt: at(-HOUR) });
    const review = await seedChatFixture(lesson.id, { id: 'review-fallthrough', mode: 'review', createdAt: at(-30 * 60 * 1000) });

    vi.setSystemTime(new Date(BASE));
    const revised = await repo.saveQuizAttempt(lesson.id, {
      questions: [],
      answers: [0],
      score: 1,
      total: 1,
      revisionOf: { feedbackTable: 'chat_messages', feedbackId: 'does-not-exist' },
    });

    expect(await repo.listQuizAttempts(lesson.id)).toHaveLength(2);
    const links = await repo.listRevisionLinks({ lessonId: lesson.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      attempt_id: prior.id,
      feedback_id: review.id,
      revised_id: revised.id,
      link_kind: 'inferred',
    });
  });

  it('ignores an unknown explicit feedback table and still infers', async () => {
    const { lesson } = await seedLesson();
    const prior = await seedQuizAttemptFixture(lesson.id, { id: 'quiz-invalid-table', createdAt: at(-HOUR) });
    const review = await seedChatFixture(lesson.id, { id: 'review-invalid-table', mode: 'review', createdAt: at(-30 * 60 * 1000) });

    vi.setSystemTime(new Date(BASE));
    const revised = await repo.saveQuizAttempt(lesson.id, {
      questions: [],
      answers: [0],
      score: 1,
      total: 1,
      revisionOf: { feedbackTable: 'learning_events; DROP TABLE', feedbackId: review.id },
    });

    const links = await repo.listRevisionLinks({ revisedId: revised.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ attempt_id: prior.id, feedback_id: review.id, link_kind: 'inferred' });
  });

  it('ignores a deleted explicit feedback row and still infers', async () => {
    const { lesson } = await seedLesson();
    const prior = await seedQuizAttemptFixture(lesson.id, { id: 'quiz-deleted-feedback', createdAt: at(-HOUR) });
    const review = await seedChatFixture(lesson.id, { id: 'review-still-valid', mode: 'review', createdAt: at(-30 * 60 * 1000) });
    const deleted = await seedChatFixture(lesson.id, { id: 'review-deleted', mode: 'review', createdAt: at(-20 * 60 * 1000) });
    await adapter.softDelete('chat_messages', deleted.id);

    vi.setSystemTime(new Date(BASE));
    const revised = await repo.saveQuizAttempt(lesson.id, {
      questions: [],
      answers: [0],
      score: 1,
      total: 1,
      revisionOf: { feedbackTable: 'chat_messages', feedbackId: deleted.id },
    });

    const links = await repo.listRevisionLinks({ revisedId: revised.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ attempt_id: prior.id, link_kind: 'inferred' });
    expect(links[0].feedback_id).not.toBe(deleted.id);
  });

  it('stores exactly one explicit link when explicit and inferable feedback both exist', async () => {
    const { lesson } = await seedLesson();
    await seedQuizAttemptFixture(lesson.id, { id: 'quiz-explicit-wins', createdAt: at(-HOUR) });
    const review = await seedChatFixture(lesson.id, { id: 'review-explicit-wins', mode: 'review', createdAt: at(-30 * 60 * 1000) });

    vi.setSystemTime(new Date(BASE));
    const revised = await repo.saveQuizAttempt(lesson.id, {
      questions: [],
      answers: [0],
      score: 1,
      total: 1,
      revisionOf: { feedbackTable: 'chat_messages', feedbackId: review.id },
    });

    const links = await repo.listRevisionLinks({ revisedId: revised.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ feedback_id: review.id, link_kind: 'explicit' });
  });

  it('keeps each revised attempt at one link across a second revision', async () => {
    const { lesson } = await seedLesson();
    await seedQuizAttemptFixture(lesson.id, { id: 'quiz-first-prior', createdAt: at(-3 * HOUR) });
    const firstReview = await seedChatFixture(lesson.id, { id: 'review-first', mode: 'review', createdAt: at(-2 * HOUR) });

    vi.setSystemTime(new Date(at(-HOUR)));
    const revised1 = await repo.saveQuizAttempt(lesson.id, { questions: [], answers: [0], score: 1, total: 1 });
    vi.setSystemTime(new Date(at(-30 * 60 * 1000)));
    const review2 = await seedChatFixture(lesson.id, { id: 'review-second', mode: 'review', createdAt: at(-30 * 60 * 1000) });

    vi.setSystemTime(new Date(BASE));
    const revised2 = await repo.saveQuizAttempt(lesson.id, { questions: [], answers: [1], score: 2, total: 2 });

    const firstLinks = await repo.listRevisionLinks({ revisedId: revised1.id });
    const secondLinks = await repo.listRevisionLinks({ revisedId: revised2.id });
    expect(firstLinks).toHaveLength(1);
    expect(firstLinks[0].feedback_id).toBe(firstReview.id);
    expect(secondLinks).toHaveLength(1);
    expect(secondLinks[0].feedback_id).toBe(review2.id);
  });
});

describe('beta revisions: read API', () => {
  it('rejects a non-indexed filter through the adapter parity guard', async () => {
    await expect(repo.listRevisionLinks({ attemptTable: 'quiz_attempts' })).rejects.toThrow(/not indexed/);
  });

  it('orders by created_at ascending and hides deleted links by default', async () => {
    const { lesson } = await seedLesson();
    await seedQuizAttemptFixture(lesson.id, { id: 'quiz-read-prior', createdAt: at(-3 * HOUR) });
    const reviewA = await seedChatFixture(lesson.id, { id: 'review-read-a', mode: 'review', createdAt: at(-2 * HOUR) });

    vi.setSystemTime(new Date(at(-HOUR)));
    const revisedA = await repo.saveQuizAttempt(lesson.id, {
      questions: [],
      answers: [0],
      score: 1,
      total: 1,
      revisionOf: { feedbackTable: 'chat_messages', feedbackId: reviewA.id },
    });
    const reviewB = await seedChatFixture(lesson.id, { id: 'review-read-b', mode: 'review', createdAt: at(-30 * 60 * 1000) });

    vi.setSystemTime(new Date(BASE));
    const revisedB = await repo.saveQuizAttempt(lesson.id, {
      questions: [],
      answers: [1],
      score: 2,
      total: 2,
      revisionOf: { feedbackTable: 'chat_messages', feedbackId: reviewB.id },
    });

    const links = await repo.listRevisionLinks({ lessonId: lesson.id });
    expect(links.map((link) => link.revised_id)).toEqual([revisedA.id, revisedB.id]);

    await adapter.softDelete('revision_links', links[0].id);
    expect(await repo.listRevisionLinks({ lessonId: lesson.id })).toHaveLength(1);
    expect(await repo.listRevisionLinks({ lessonId: lesson.id, includeDeleted: true })).toHaveLength(2);
  });

  it('does not emit a second learning event for a revision', async () => {
    const { lesson } = await seedLesson();
    await seedQuizAttemptFixture(lesson.id, { id: 'quiz-no-second-event', createdAt: at(-HOUR) });
    const review = await seedChatFixture(lesson.id, { id: 'review-no-second-event', mode: 'review', createdAt: at(-30 * 60 * 1000) });

    vi.setSystemTime(new Date(BASE));
    await repo.saveQuizAttempt(lesson.id, {
      questions: [],
      answers: [0],
      score: 1,
      total: 1,
      revisionOf: { feedbackTable: 'chat_messages', feedbackId: review.id },
    });

    const events = await repo.listEvents();
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('quiz_completed');
  });
});
