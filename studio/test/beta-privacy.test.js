import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import { buildBetaReport, reportSchema } from '../src/lib/beta/report.js';

const SENTINELS = {
  title: 'SENTINEL_COURSE_TITLE_7f3a',
  description: 'SENTINEL_COURSE_DESCRIPTION_91bc',
  content: 'SENTINEL_LESSON_CONTENT_55de',
  prompt: 'SENTINEL_TUTOR_PROMPT_2a10',
  answer: 'SENTINEL_TUTOR_ANSWER_c4f2',
  code: 'SENTINEL_RUN_CODE_88aa',
  quizAnswer: 'SENTINEL_QUIZ_ANSWER_0be1',
  submission: 'SENTINEL_CAPSTONE_SUBMISSION_6d77',
  key: 'sk-live-SENTINEL0123456789abcdef',
};

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
});

async function seedAll() {
  const course = await repo.createCourse({
    title: SENTINELS.title,
    description: `${SENTINELS.description} ${SENTINELS.key}`,
    lessons: [{ title: 'Privacy lesson', content_md: SENTINELS.content }],
  });
  const lesson = course.lessons[0];
  const capstone = await repo.createCapstone({
    courseId: course.id,
    brief_md: `brief ${SENTINELS.key}`,
    rubric: [],
  });
  return { course, lesson, capstone };
}

function assertNoSentinels(serialized) {
  for (const value of Object.values(SENTINELS)) {
    expect(serialized.includes(value)).toBe(false);
  }
}

describe('beta privacy: content-free event rows', () => {
  it('never stores course, lesson, prompt, code, answer or key content in events', async () => {
    const { course, lesson, capstone } = await seedAll();

    await repo.saveQuizAttempt(lesson.id, {
      questions: [{ prompt: SENTINELS.prompt }],
      answers: [SENTINELS.quizAnswer],
      score: 1,
      total: 1,
    });

    const cards = await repo.addCards(course.id, lesson.id, [{ front: SENTINELS.prompt, back: SENTINELS.answer }]);
    await repo.gradeCard(cards[0].id, 2);

    await repo.appendChat(lesson.id, { role: 'user', content: SENTINELS.prompt, mode: 'check_answer' });
    await repo.appendChat(lesson.id, { role: 'assistant', content: SENTINELS.answer, mode: 'check_answer' });

    await repo.saveRunResult({
      lessonId: lesson.id,
      stdout: SENTINELS.code,
      stderr: SENTINELS.code,
      exitCode: 1,
      checks: { checks: [{ name: SENTINELS.code, passed: false }], snapshot: { files: { 'a.js': SENTINELS.code } } },
    });

    await repo.createCapstoneSubmission({
      capstoneId: capstone.id,
      content_md: SENTINELS.submission,
      repo_url: `https://example.test/${SENTINELS.key}`,
      testResults: { source: 'external', output: SENTINELS.code },
      externalId: 'cli:privacy',
    });

    const events = await repo.listEvents();
    expect(events.length).toBeGreaterThanOrEqual(5);
    assertNoSentinels(JSON.stringify(events));

    const backup = await repo.exportAll();
    expect(backup.tables.learning_events.length).toBe(events.length);
    assertNoSentinels(JSON.stringify(backup.tables.learning_events));
  });

  it('rejects free strings, arrays, unknown keys and over-512 meta without writing a row', async () => {
    const { lesson } = await seedAll();
    await repo.saveQuizAttempt(lesson.id, { questions: [], answers: [0], score: 1, total: 1 });
    const before = (await repo.listEvents()).length;

    await expect(
      repo.recordEvent({
        kind: 'quiz_completed',
        surface: 'quiz',
        lessonId: lesson.id,
        meta: { score: SENTINELS.key },
      })
    ).rejects.toThrow();
    expect(await repo.listEvents()).toHaveLength(before);

    await expect(
      repo.recordEvent({
        kind: 'quiz_completed',
        surface: 'quiz',
        lessonId: lesson.id,
        meta: { answered: ['x'] },
      })
    ).rejects.toThrow();
    expect(await repo.listEvents()).toHaveLength(before);

    await expect(
      repo.recordEvent({
        kind: 'quiz_completed',
        surface: 'quiz',
        lessonId: lesson.id,
        meta: { note: 'nope' },
      })
    ).rejects.toThrow();
    expect(await repo.listEvents()).toHaveLength(before);

    await expect(
      repo.recordEvent({
        kind: 'quiz_completed',
        surface: 'quiz',
        lessonId: lesson.id,
        meta: { note: 'x'.repeat(600) },
      })
    ).rejects.toThrow();
    expect(await repo.listEvents()).toHaveLength(before);
  });

  it('rejects a non-indexed event filter through the adapter parity guard', async () => {
    await expect(repo.listEvents({ meta_json: 'x' })).rejects.toThrow(/not indexed/);
  });
});

describe('beta privacy: content-free report', () => {
  it('builds a report with no course text, ids, URLs, model names or meta', async () => {
    const { course, lesson, capstone } = await seedAll();

    await repo.saveQuizAttempt(lesson.id, {
      questions: [{ prompt: SENTINELS.prompt }],
      answers: [SENTINELS.quizAnswer],
      score: 1,
      total: 1,
    });

    const cards = await repo.addCards(course.id, lesson.id, [
      { front: SENTINELS.prompt, back: SENTINELS.answer },
    ]);
    await repo.gradeCard(cards[0].id, 2);

    await repo.appendChat(lesson.id, {
      role: 'user',
      content: SENTINELS.prompt,
      mode: 'review',
    });
    await repo.appendChat(lesson.id, {
      role: 'assistant',
      content: SENTINELS.answer,
      mode: 'review',
    });

    await repo.saveRunResult({
      lessonId: lesson.id,
      stdout: SENTINELS.code,
      stderr: SENTINELS.code,
      exitCode: 1,
      checks: { checks: [{ name: SENTINELS.code, passed: false }], snapshot: { files: { 'a.js': SENTINELS.code } } },
    });

    await repo.createCapstoneSubmission({
      capstoneId: capstone.id,
      content_md: SENTINELS.submission,
      repo_url: `https://example.test/${SENTINELS.key}`,
      testResults: { source: 'external', output: SENTINELS.code },
      externalId: 'cli:privacy-report',
    });

    const report = buildBetaReport({
      events: await repo.listEvents(),
      profile: await repo.getBetaProfile(),
      revisionLinks: await repo.listRevisionLinks(),
      now: new Date(),
      app: { version: '0.1.0', storage: 'memory', provider: 'byok:openai' },
      capstone: { started: true, submissions: 1, externalEvidence: 1, verdict: null },
    });

    const serialized = JSON.stringify(report);
    assertNoSentinels(serialized);
    expect(serialized).not.toContain(course.id);
    expect(serialized).not.toContain(lesson.id);
    expect(serialized).not.toContain(capstone.id);
    expect(serialized).not.toContain('example.test');
    expect(serialized).not.toContain('"meta"');
    expect(serialized).not.toMatch(/gpt-|claude-[a-z0-9]/i);
    expect(reportSchema.safeParse(report).success).toBe(true);
    expect(report).not.toHaveProperty('course_id');
    expect(report).not.toHaveProperty('lesson_id');
  });
});
