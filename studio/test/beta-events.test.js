import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import { dayKey } from '../src/lib/course.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
});

async function seedLesson() {
  const course = await repo.createCourse({ title: 'Quiz course', lessons: [{ title: 'L1' }] });
  return { course, lesson: course.lessons[0] };
}

describe('beta events: quiz tracer', () => {
  it('writes exactly one quiz_completed event for a quiz attempt', async () => {
    const { course, lesson } = await seedLesson();
    const attempt = await repo.saveQuizAttempt(lesson.id, {
      questions: [{ id: 'q1' }],
      answers: [0],
      score: 1,
      total: 1,
    });

    const events = await repo.listEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'quiz_completed',
      surface: 'quiz',
      ref_id: attempt.id,
      lesson_id: lesson.id,
      course_id: course.id,
      day: dayKey(new Date()),
    });
    expect(JSON.parse(events[0].meta_json)).toEqual({ total: 1, score: 1, answered: 1 });
    expect(await repo.listEvents({ lessonId: lesson.id })).toHaveLength(1);
  });

  it('getBetaProfile creates one inactive profile with a UUID participant id', async () => {
    const first = await repo.getBetaProfile();
    expect(first.participant_id).toMatch(UUID_RE);
    expect(first.activated_at).toBeNull();
    expect(first.activated_day).toBeNull();

    const second = await repo.getBetaProfile();
    expect(second.id).toBe('local');
    expect(second.participant_id).toBe(first.participant_id);
    expect(second.activated_at).toBeNull();
    expect(await repo.listEvents()).toHaveLength(0);
  });

  it('activates the profile on the first meaningful event and never rewrites it', async () => {
    const { lesson } = await seedLesson();
    const before = await repo.getBetaProfile();
    expect(before.activated_at).toBeNull();

    await repo.saveQuizAttempt(lesson.id, { questions: [], answers: [0, 1], score: 2, total: 2 });
    const afterFirst = await repo.getBetaProfile();
    expect(afterFirst.participant_id).toBe(before.participant_id);
    expect(afterFirst.activated_at).toBeTruthy();
    expect(afterFirst.activated_day).toBe(dayKey(new Date()));

    await repo.saveQuizAttempt(lesson.id, { questions: [], answers: [0], score: 1, total: 1 });
    const afterSecond = await repo.getBetaProfile();
    expect(afterSecond.activated_at).toBe(afterFirst.activated_at);
    expect(afterSecond.activated_day).toBe(afterFirst.activated_day);
    expect(await repo.listEvents()).toHaveLength(2);
  });

  it('creates an activated profile when the first event arrives without getBetaProfile', async () => {
    const { lesson } = await seedLesson();
    await repo.saveQuizAttempt(lesson.id, { questions: [], answers: [0], score: 1, total: 1 });
    const profile = await repo.getBetaProfile();
    expect(profile.participant_id).toMatch(UUID_RE);
    expect(profile.activated_at).toBeTruthy();
    expect(profile.activated_day).toBe(dayKey(new Date()));
  });
});

describe('beta events: full emission matrix', () => {
  it('emits one recall_completed per graded card', async () => {
    const { course, lesson } = await seedLesson();
    const cards = await repo.addCards(course.id, lesson.id, [
      { front: 'q1', back: 'a1' },
      { front: 'q2', back: 'a2' },
    ]);

    await repo.gradeCard(cards[0].id, 2);
    await repo.gradeCard(cards[1].id, 3);

    const events = await repo.listEvents({ kind: 'recall_completed' });
    expect(events).toHaveLength(2);
    expect(events.map((e) => JSON.parse(e.meta_json))).toEqual([{ grade: 2 }, { grade: 3 }]);
    expect(events.every((e) => e.surface === 'recall')).toBe(true);
    expect(events.every((e) => e.lesson_id === lesson.id && e.course_id === course.id)).toBe(true);
  });

  it('emits answer_sent_for_review only for user check_answer/review messages', async () => {
    const { course, lesson } = await seedLesson();

    await repo.appendChat(lesson.id, { role: 'user', content: 'my answer', mode: 'check_answer' });
    await repo.appendChat(lesson.id, { role: 'assistant', content: 'feedback', mode: 'check_answer' });
    await repo.appendChat(lesson.id, { role: 'user', content: 'plain question' });
    await repo.appendChat(lesson.id, { role: 'user', content: 'revised answer', mode: 'review' });

    const events = await repo.listEvents({ kind: 'answer_sent_for_review' });
    expect(events).toHaveLength(2);
    expect(events.map((e) => JSON.parse(e.meta_json).mode)).toEqual(['check_answer', 'review']);
    expect(events.every((e) => e.surface === 'tutor' && e.lesson_id === lesson.id && e.course_id === course.id)).toBe(
      true
    );
  });

  it('discriminates workspace_run from exercise_completed by the inner checks array', async () => {
    const { lesson } = await seedLesson();
    const snapshot = { files: {}, entry: null, language: 'javascript', hash: 'h' };

    const workspace = await repo.saveRunResult({
      lessonId: lesson.id,
      checks: { checks: [], snapshot },
    });
    const exercise = await repo.saveRunResult({
      lessonId: lesson.id,
      checks: { checks: [{ passed: true }, { passed: false }], snapshot },
    });
    const legacy = await repo.saveRunResult({
      lessonId: lesson.id,
      checks: [{ ok: false }],
    });

    const events = await repo.listEvents();
    expect(events).toHaveLength(3);
    expect(events.filter((e) => e.ref_id === workspace.id).map((e) => e.kind)).toEqual(['workspace_run']);
    expect(events.filter((e) => e.ref_id === exercise.id).map((e) => e.kind)).toEqual(['exercise_completed']);
    expect(events.filter((e) => e.ref_id === legacy.id).map((e) => e.kind)).toEqual(['exercise_completed']);

    expect(JSON.parse(events[0].meta_json)).toEqual({ runner: 'browser', checks_total: 0 });
    expect(JSON.parse(events[1].meta_json)).toEqual({ runner: 'browser', checks_total: 2, checks_passed: 1 });
    expect(JSON.parse(events[2].meta_json)).toEqual({ runner: 'browser', checks_total: 1, checks_passed: 0 });
    expect(events.every((e) => e.surface === 'workspace' && e.lesson_id === lesson.id)).toBe(true);
  });

  it('puts exit_code only on workspace_run and never throws after the run write', async () => {
    const { lesson } = await seedLesson();

    const exercise = await repo.saveRunResult({
      lessonId: lesson.id,
      exitCode: 0,
      checks: { checks: [{ passed: true }], snapshot: {} },
    });
    const workspace = await repo.saveRunResult({
      lessonId: lesson.id,
      exitCode: 2,
      checks: { checks: [], snapshot: {} },
    });

    const events = await repo.listEvents();
    expect(events).toHaveLength(2);

    const exerciseEvent = events.find((e) => e.ref_id === exercise.id);
    const workspaceEvent = events.find((e) => e.ref_id === workspace.id);
    expect(exerciseEvent.kind).toBe('exercise_completed');
    expect(workspaceEvent.kind).toBe('workspace_run');
    expect(JSON.parse(exerciseEvent.meta_json)).toEqual({
      runner: 'browser',
      checks_total: 1,
      checks_passed: 1,
    });
    expect(JSON.parse(workspaceEvent.meta_json)).toEqual({
      runner: 'browser',
      checks_total: 0,
      exit_code: 2,
    });
  });

  it('emits one capstone_checkpoint per created submission and none on an externalId repeat', async () => {
    const { course } = await seedLesson();
    const capstone = await repo.createCapstone({ courseId: course.id, brief_md: 'brief' });

    await repo.createCapstoneSubmission({ capstoneId: capstone.id, content_md: 'one', externalId: 'cli:x' });
    await repo.createCapstoneSubmission({ capstoneId: capstone.id, content_md: 'one', externalId: 'cli:x' });
    await repo.createCapstoneSubmission({
      capstoneId: capstone.id,
      content_md: 'two',
      testResults: { source: 'external' },
      externalId: 'cli:y',
    });

    const events = await repo.listEvents({ kind: 'capstone_checkpoint' });
    expect(events).toHaveLength(2);
    expect(events.map((e) => JSON.parse(e.meta_json))).toEqual([
      { source: 'in_app', attempt: 1 },
      { source: 'external', attempt: 2 },
    ]);
    expect(events.every((e) => e.surface === 'capstone' && e.course_id === course.id)).toBe(true);
  });

  it('keeps lesson-done, notes, reflections, workspace files, activity and importAll event-free', async () => {
    const { course, lesson } = await seedLesson();

    await repo.updateLesson(lesson.id, { status: 'done' });
    await repo.addLessonVersion(lesson.id, { content_md: 'more' });
    await repo.saveReflection(lesson.id, { hardest: 'loops' });
    await repo.saveNote({ courseId: course.id, lessonId: lesson.id, content_md: 'note' });
    await repo.saveWorkspaceFile({ courseId: course.id, lessonId: lesson.id, path: 'main.js', content: 'x' });
    await repo.logActivity('lesson_done', lesson.id);

    expect(await repo.listEvents()).toHaveLength(0);

    await repo.saveQuizAttempt(lesson.id, { questions: [], answers: [0], score: 1, total: 1 });
    const dump = await repo.exportAll();
    const before = (await repo.listEvents()).length;
    expect(before).toBe(1);
    await repo.importAll(dump);
    expect(await repo.listEvents()).toHaveLength(before);
  });
});
