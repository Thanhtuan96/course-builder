/**
 * CLI parity for the beta data foundation (INSTR-01).
 *
 * The CLI `review` and `import` commands share the Studio SQLite store and the same repository
 * functions as the browser. These tests invoke the real `run()` entry points in a temp
 * `PROFESSOR_HOME` (Phase 5 owns only `studio/test/beta-*.test.js`, so the root `test/cli-*.test.js`
 * files stay untouched) and then prove a SQLite-to-memory restore builds an identical report.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { createStudioStore } from '../../bin/studio-store.js';
import { run as runReview } from '../../bin/commands/review.js';
import { run as runImport } from '../../bin/commands/import.js';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import { dayKey } from '../src/lib/course.js';
import { buildBetaReport } from '../src/lib/beta/report.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '..', '..', 'test', 'fixtures', 'courses', 'flavour-table');
const FIXED_NOW = new Date('2026-10-22T12:00:00.000Z');

const sortById = (rows) => [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

function linkKindCounts(links) {
  const counts = { explicit: 0, inferred: 0 };
  for (const link of links) if (link.link_kind in counts) counts[link.link_kind] += 1;
  return counts;
}

let home;
let store;
let previousHome;

beforeEach(() => {
  previousHome = process.env.PROFESSOR_HOME;
  home = mkdtempSync(join(tmpdir(), 'beta-cli-'));
  process.env.PROFESSOR_HOME = home;
  store = createStudioStore({ dbPath: join(home, 'professor.db'), log: () => {} });
  repo.useAdapter(store);
});

afterEach(() => {
  try {
    store.close();
  } catch {
    /* already closed */
  }
  repo.useAdapter(createMemoryAdapter());
  if (previousHome === undefined) delete process.env.PROFESSOR_HOME;
  else process.env.PROFESSOR_HOME = previousHome;
  rmSync(home, { recursive: true, force: true });
});

describe('beta CLI parity', () => {
  it('sees a due card through the temp store and gradeCard emits one recall event', async () => {
    const course = await repo.createCourse({ title: 'CLI review', lessons: [{ title: 'L1' }] });
    const lesson = course.lessons[0];
    const [card] = await repo.addCards(course.id, lesson.id, [{ front: 'q', back: 'a' }]);
    await store.put('cards', { ...card, due_at: '2026-10-14T00:00:00.000Z' });

    const result = await runReview({
      store,
      tty: false,
      now: Date.parse('2026-10-15T12:00:00Z'),
      style: (type, message) => message,
    });
    expect(result).toEqual({ due: 1, reviewed: 0 });
    expect(await repo.listEvents()).toHaveLength(0);

    const graded = await repo.gradeCard(card.id, 2);
    const recall = await repo.listEvents({ kind: 'recall_completed' });
    expect(recall).toHaveLength(1);
    expect(recall[0]).toMatchObject({
      surface: 'recall',
      lesson_id: lesson.id,
      ref_id: graded.review.id,
    });
    expect(await repo.listEvents()).toHaveLength(1);
  });

  it('imports the fixture through run() and writes one today-dated quiz event', async () => {
    const cwd = join(home, 'cwd');
    mkdirSync(join(cwd, 'learning'), { recursive: true });
    cpSync(FIXTURE, join(cwd, 'learning', 'flavour-table'), { recursive: true });
    appendFileSync(
      join(cwd, 'learning', 'flavour-table', 'LEARNING-LOG.md'),
      '\n### Section 2 — Second Steps\n\n- Date: 2026-10-16\n- Verdict: scored 4/5\n'
    );

    const result = await runImport({ args: ['--all'], cwd, store, style: (type, message) => message });
    expect(result.courses).toBe(1);

    expect(await store.get('courses', 'cli-course-flavour-table')).toBeTruthy();
    expect(
      await store.list('lessons', { where: { course_id: 'cli-course-flavour-table' } })
    ).toHaveLength(3);
    expect(await store.list('cards', { where: { course_id: 'cli-course-flavour-table' } })).toHaveLength(2);

    const quiz = await repo.listEvents({ kind: 'quiz_completed' });
    expect(quiz).toHaveLength(1);
    expect(quiz[0]).toMatchObject({
      surface: 'quiz',
      lesson_id: 'cli-lesson-flavour-table-2',
      day: dayKey(new Date()),
    });
    expect(quiz[0].day).not.toBe('2026-10-16');
    expect(await repo.listEvents()).toHaveLength(1);
  });

  it('imports a repeat capstone externalId once and activates the profile once', async () => {
    const course = await repo.createCourse({ title: 'CLI capstone', lessons: [] });
    const capstone = await repo.createCapstone({ courseId: course.id, brief_md: 'brief', rubric: [] });

    const first = await repo.createCapstoneSubmission({
      capstoneId: capstone.id,
      content_md: 'one',
      externalId: 'cli:capstone:completion',
    });
    const activated = await repo.getBetaProfile();
    expect(activated.activated_at).toBeTruthy();

    const second = await repo.createCapstoneSubmission({
      capstoneId: capstone.id,
      content_md: 'one',
      externalId: 'cli:capstone:completion',
    });

    expect(second.id).toBe(first.id);
    expect(await repo.listEvents({ kind: 'capstone_checkpoint' })).toHaveLength(1);
    expect(await repo.listCapstoneSubmissions(capstone.id)).toHaveLength(1);

    const after = await repo.getBetaProfile();
    expect(after.activated_at).toBe(activated.activated_at);
    expect(after.participant_id).toBe(activated.participant_id);
  });

  it('importAll and marking a lesson done emit no events', async () => {
    const course = await repo.createCourse({ title: 'Quiet paths', lessons: [{ title: 'L1' }] });
    const lesson = course.lessons[0];
    await repo.saveQuizAttempt(lesson.id, { questions: [], answers: [0], score: 1, total: 1 });

    const dump = await repo.exportAll();
    const before = (await repo.listEvents()).length;
    expect(before).toBe(1);

    await repo.importAll(dump);
    expect(await repo.listEvents()).toHaveLength(before);

    await repo.updateLesson(lesson.id, { status: 'done' });
    expect(await repo.listEvents()).toHaveLength(before);
  });

  it('restores SQLite beta rows into memory with an identical report', async () => {
    const course = await repo.createCourse({
      title: 'SQLite report',
      kind: 'programming',
      lessons: [{ title: 'L1' }],
    });
    const lesson = course.lessons[0];
    await repo.saveQuizAttempt(lesson.id, {
      questions: [{ id: 'q1' }],
      answers: [0],
      score: 0,
      total: 1,
    });
    const feedback = await repo.appendChat(lesson.id, {
      role: 'assistant',
      content: 'feedback',
      mode: 'review',
    });
    const revised = await repo.saveQuizAttempt(lesson.id, {
      questions: [{ id: 'q1' }],
      answers: [0],
      score: 1,
      total: 1,
      revisionOf: { feedbackTable: 'chat_messages', feedbackId: feedback.id },
    });
    const [card] = await repo.addCards(course.id, lesson.id, [{ front: 'q', back: 'a' }]);
    await repo.gradeCard(card.id, 2);
    await repo.appendChat(lesson.id, { role: 'user', content: 'review', mode: 'review' });

    const app = { version: '1.6.0-beta.1', storage: 'sqlite', provider: null };
    const capstoneSummary = { started: true, submissions: 1, externalEvidence: 0, verdict: null };

    const events = await repo.listEvents();
    const links = await repo.listRevisionLinks();
    const profile = await repo.getBetaProfile();
    expect(revised.id).toBeTruthy();
    expect(linkKindCounts(links)).toEqual({ explicit: 1, inferred: 0 });
    const report = buildBetaReport({
      events,
      profile,
      revisionLinks: links,
      now: FIXED_NOW,
      app,
      capstone: capstoneSummary,
    });
    const dump = await repo.exportAll();

    repo.useAdapter(createMemoryAdapter());
    await repo.importAll(dump);

    const restoredEvents = await repo.listEvents();
    const restoredLinks = await repo.listRevisionLinks();
    const restoredProfile = await repo.getBetaProfile();

    expect(sortById(restoredEvents)).toEqual(sortById(events));
    expect(sortById(restoredLinks)).toEqual(sortById(links));
    expect(restoredProfile).toEqual(profile);
    expect(linkKindCounts(restoredLinks)).toEqual(linkKindCounts(links));
    expect(
      buildBetaReport({
        events: restoredEvents,
        profile: restoredProfile,
        revisionLinks: restoredLinks,
        now: FIXED_NOW,
        app,
        capstone: capstoneSummary,
      })
    ).toEqual(report);
  });
});
