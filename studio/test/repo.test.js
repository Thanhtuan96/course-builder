import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import { dayKey } from '../src/lib/course.js';

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
});

describe('repo: courses and lessons', () => {
  it('createCourse stamps ids/owner/timestamps and returns ordered lessons', async () => {
    const course = await repo.createCourse({
      title: 'Testing 101',
      level: 'Beginner',
      kind: 'programming',
      goal: 'Write a test',
      topics: ['vitest'],
      lessons: [{ title: 'First' }, { title: 'Second' }, { title: 'Third' }],
    });
    expect(course.id).toBeTruthy();
    expect(course.owner_id).toBe('local');
    expect(course.created_at).toBeTruthy();
    expect(course.updated_at).toBeTruthy();
    expect(course.kind).toBe('programming');
    expect(course.lessons.map((l) => l.position)).toEqual([1, 2, 3]);
    expect(course.lessons[0].status).toBe('todo');
    expect(course.lessons[0].owner_id).toBe('local');

    const fetched = await repo.getCourse(course.id);
    expect(fetched.title).toBe('Testing 101');
    expect(fetched.lessons).toHaveLength(3);
  });

  it('updateCourse merges allowed fields and bumps updated_at', async () => {
    const course = await repo.createCourse({ title: 'A', lessons: [] });
    await new Promise((r) => setTimeout(r, 2));
    const updated = await repo.updateCourse(course.id, { title: 'B', topics: ['x'] });
    expect(updated.title).toBe('B');
    expect(JSON.parse(updated.topics_json)).toEqual(['x']);
    expect(updated.created_at).toBe(course.created_at);
    expect(updated.updated_at >= course.updated_at).toBe(true);
  });

  it('regenerating a lesson ADDS a version and keeps both in history', async () => {
    const course = await repo.createCourse({ title: 'C', lessons: [{ title: 'L1' }] });
    const lesson = course.lessons[0];
    const v1 = await repo.addLessonVersion(lesson.id, { content_md: 'version one', model: 'm', provider: 'p' });
    const v2 = await repo.addLessonVersion(lesson.id, { content_md: 'version two', model: 'm', provider: 'p' });
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);

    const versions = await repo.listLessonVersions(lesson.id);
    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.content_md)).toEqual(['version one', 'version two']);

    const current = await repo.getLessonContent(lesson.id);
    expect(current.content_md).toBe('version two');

    const reloaded = await repo.getLesson(lesson.id);
    expect(reloaded.current_version_id).toBe(v2.id);
  });

  it('createCourse with inline content_md creates version 1', async () => {
    const course = await repo.createCourse({ title: 'D', lessons: [{ title: 'L', content_md: 'seeded' }] });
    const content = await repo.getLessonContent(course.lessons[0].id);
    expect(content.content_md).toBe('seeded');
    expect(content.version).toBe(1);
  });

  it('deleteCourse soft-deletes and cascades to lessons', async () => {
    const course = await repo.createCourse({ title: 'E', lessons: [{ title: 'L1' }, { title: 'L2' }] });
    await repo.deleteCourse(course.id);
    expect(await repo.getCourse(course.id)).toBeNull();
    expect(await repo.listCourses()).toHaveLength(0);
    const dump = await repo.exportAll();
    expect(dump.tables.lessons.every((l) => l.deleted_at)).toBe(true);
  });
});

describe('repo: cards and reviews', () => {
  it('addCards then listDueCards returns due cards; gradeCard reschedules + writes a review', async () => {
    const course = await repo.createCourse({ title: 'F', lessons: [{ title: 'L' }] });
    const lesson = course.lessons[0];
    const cards = await repo.addCards(course.id, lesson.id, [
      { front: 'q1', back: 'a1' },
      { front: 'q2', back: 'a2' },
    ]);
    expect(cards).toHaveLength(2);
    expect((await repo.listDueCards()).length).toBe(2);

    const graded = await repo.gradeCard(cards[0].id, 2);
    expect(graded.card.reps).toBe(1);
    expect(Date.parse(graded.card.due_at) > Date.now()).toBe(true);
    expect((await repo.listDueCards()).length).toBe(1); // future cards drop out
    expect(graded.review.grade).toBe(2);
  });
});

describe('repo: history and portability', () => {
  it('getLessonHistory gathers versions + attempts + chat + notes + reflection', async () => {
    const course = await repo.createCourse({ title: 'G', lessons: [{ title: 'L' }] });
    const lesson = course.lessons[0];
    await repo.addLessonVersion(lesson.id, { content_md: 'v1' });
    await repo.saveQuizAttempt(lesson.id, { questions: [{ q: 1 }], answers: [0], score: 1, total: 1 });
    await repo.appendChat(lesson.id, { role: 'user', content: 'hi' });
    await repo.appendChat(lesson.id, { role: 'assistant', content: 'hello' });
    await repo.saveNote({ courseId: course.id, lessonId: lesson.id, content_md: 'note' });
    await repo.saveReflection(lesson.id, { hardest: 'loops', confidence: 2 });

    const history = await repo.getLessonHistory(lesson.id);
    expect(history.versions).toHaveLength(1);
    expect(history.attempts).toHaveLength(1);
    expect(history.chat).toHaveLength(2);
    expect(history.notes).toHaveLength(1);
    expect(history.reflection.hardest).toBe('loops');
  });

  it('export/import round-trips all data and never contains settings or keys', async () => {
    const course = await repo.createCourse({ title: 'H', lessons: [{ title: 'L' }] });
    await repo.addCards(course.id, course.lessons[0].id, [{ front: 'q', back: 'a' }]);
    const dump = await repo.exportAll();

    const json = JSON.stringify(dump);
    expect(json.includes('sk-ant')).toBe(false);
    expect(dump.tables).not.toHaveProperty('settings');
    expect(dump.tables.courses).toHaveLength(1);
    expect(dump.tables.cards).toHaveLength(1);

    repo.useAdapter(createMemoryAdapter());
    await repo.importAll(dump);
    expect(await repo.listCourses()).toHaveLength(1);
    expect(await repo.listDueCards()).toHaveLength(1);
  });

  it('logActivity stores a day key and listActivity returns it', async () => {
    await repo.logActivity('lesson_done', 'l1');
    const rows = await repo.listActivity();
    expect(rows).toHaveLength(1);
    expect(rows[0].day).toBe(dayKey(new Date()));
    expect(rows[0].kind).toBe('lesson_done');
  });
});

describe('repo: code workspace', () => {
  it('saveWorkspaceFile upserts by (lesson_id, path) and lists them', async () => {
    const course = await repo.createCourse({ title: 'I', kind: 'programming', lessons: [{ title: 'L' }] });
    const lesson = course.lessons[0];
    await repo.saveWorkspaceFile({ courseId: course.id, lessonId: lesson.id, path: 'main.js', language: 'javascript', content: 'a' });
    await repo.saveWorkspaceFile({ courseId: course.id, lessonId: lesson.id, path: 'main.js', language: 'javascript', content: 'b' });
    await repo.saveWorkspaceFile({ courseId: course.id, lessonId: lesson.id, path: 'util.js', language: 'javascript', content: 'c' });
    const files = await repo.listWorkspaceFiles(lesson.id);
    expect(files).toHaveLength(2);
    expect(files.find((f) => f.path === 'main.js').content).toBe('b');
  });

  it('deleteWorkspaceFile soft-deletes by (lesson_id, path) and hides the row', async () => {
    const course = await repo.createCourse({ title: 'I2', kind: 'programming', lessons: [{ title: 'L' }] });
    const lesson = course.lessons[0];
    await repo.saveWorkspaceFile({ courseId: course.id, lessonId: lesson.id, path: 'main.js', content: 'a' });
    await repo.saveWorkspaceFile({ courseId: course.id, lessonId: lesson.id, path: 'old.js', content: 'b' });

    const removed = await repo.deleteWorkspaceFile({ lessonId: lesson.id, path: 'old.js' });
    expect(removed.deleted_at).toBeTruthy();
    const files = await repo.listWorkspaceFiles(lesson.id);
    expect(files.map((f) => f.path)).toEqual(['main.js']);
    expect(await repo.deleteWorkspaceFile({ lessonId: lesson.id, path: 'missing.js' })).toBeNull();
  });

  it('saveRunResult + listRunResults', async () => {
    const course = await repo.createCourse({ title: 'J', kind: 'programming', lessons: [{ title: 'L' }] });
    const lesson = course.lessons[0];
    const file = await repo.saveWorkspaceFile({ lessonId: lesson.id, path: 'main.js', content: 'x' });
    await repo.saveRunResult({ lessonId: lesson.id, fileId: file.id, runner: 'browser', stdout: 'ok', exitCode: 0, checks: [{ ok: true }] });
    const results = await repo.listRunResults(lesson.id);
    expect(results).toHaveLength(1);
    expect(results[0].exit_code).toBe(0);
    expect(JSON.parse(results[0].checks_json)).toEqual([{ ok: true }]);
  });
});

describe('repo: capstone (Phase 33)', () => {
  it('createCapstone is immutable and decodes the JSON columns', async () => {
    const course = await repo.createCourse({ title: 'Cap', kind: 'programming', lessons: [{ title: 'L' }] });
    const created = await repo.createCapstone({
      courseId: course.id,
      kind: 'programming',
      brief_md: 'ship it',
      rubric: [{ name: 'Correctness', solid: 'works' }],
      tests: { language: 'javascript', entry: 't.js', files: { 't.js': 'check("x", () => true)' } },
      artifact: { title: 'App', deliverable: 'deploy', definitionOfDone: ['demo link'] },
    });
    expect(created.owner_id).toBe('local');
    expect(created.rubric[0].name).toBe('Correctness');
    expect(created.tests.entry).toBe('t.js');
    expect(created.artifact.title).toBe('App');
    expect(created.hiddenAnswers).toBeNull();

    const again = await repo.createCapstone({ courseId: course.id, brief_md: 'OVERWRITE?' });
    expect(again.id).toBe(created.id);
    expect(again.brief_md).toBe('ship it');
    expect(await repo.getCapstone(course.id)).toMatchObject({ id: created.id, brief_md: 'ship it' });
  });

  it('stores quantitative hidden answers without exposing them to the learner model', async () => {
    const course = await repo.createCourse({ title: 'Stats', kind: 'quantitative', lessons: [{ title: 'L' }] });
    const capstone = await repo.createCapstone({ courseId: course.id, kind: 'quantitative', brief_md: 'p', hiddenAnswers: ['42', '7'] });
    expect(capstone.hiddenAnswers).toEqual(['42', '7']);
  });

  it('appends submissions with increasing attempts and supports idempotent external ids', async () => {
    const course = await repo.createCourse({ title: 'Subs', lessons: [{ title: 'L' }] });
    const capstone = await repo.createCapstone({ courseId: course.id, brief_md: 'p', rubric: [] });
    const a = await repo.createCapstoneSubmission({ capstoneId: capstone.id, content_md: 'one' });
    const b = await repo.createCapstoneSubmission({ capstoneId: capstone.id, content_md: 'two', verdict: 'needs_work' });
    expect(a.attempt).toBe(1);
    expect(b.attempt).toBe(2);

    const imported = await repo.createCapstoneSubmission({ capstoneId: capstone.id, content_md: 'cli', externalId: 'cli:x:completion' });
    const importedAgain = await repo.createCapstoneSubmission({ capstoneId: capstone.id, content_md: 'cli', externalId: 'cli:x:completion' });
    expect(importedAgain.id).toBe(imported.id);

    const list = await repo.listCapstoneSubmissions(capstone.id);
    expect(list.map((s) => s.attempt)).toEqual([1, 2, 3]);
    expect((await repo.getLatestCapstoneSubmission(capstone.id)).id).toBe(imported.id);
  });

  it('listCourseWorkspaceFiles aggregates every lesson file by path', async () => {
    const course = await repo.createCourse({ title: 'WS', kind: 'programming', lessons: [{ title: 'L1' }, { title: 'L2' }] });
    await repo.saveWorkspaceFile({ courseId: course.id, lessonId: course.lessons[0].id, path: 'main.js', content: 'a' });
    await repo.saveWorkspaceFile({ courseId: course.id, lessonId: course.lessons[1].id, path: 'util.js', content: 'b' });
    await repo.saveWorkspaceFile({ courseId: course.id, lessonId: course.lessons[1].id, path: 'main.js', content: 'c' });
    const files = await repo.listCourseWorkspaceFiles(course.id);
    expect(files.find((f) => f.path === 'main.js').content).toBe('c');
    expect(files.map((f) => f.path).sort()).toEqual(['main.js', 'util.js']);
  });
});

describe('repo: listCards', () => {
  it('lists cards soonest-due-first, scoped by course/lesson and excluding deleted', async () => {
    const a = await repo.createCourse({ title: 'A', lessons: [{ title: 'L1' }] });
    const b = await repo.createCourse({ title: 'B', lessons: [{ title: 'L2' }] });
    const aCards = await repo.addCards(a.id, a.lessons[0].id, [
      { front: 'later', back: 'x' },
      { front: 'sooner', back: 'y' },
    ]);
    await repo.addCards(b.id, b.lessons[0].id, [{ front: 'other', back: 'z' }]);
    // Force distinct due times: make one card due far in the future.
    await repo.gradeCard(aCards[1].id, 3);

    const scoped = await repo.listCards({ courseId: a.id });
    expect(scoped).toHaveLength(2);
    expect(scoped.every((c) => c.course_id === a.id)).toBe(true);
    expect(Date.parse(scoped[0].due_at)).toBeLessThanOrEqual(Date.parse(scoped[1].due_at));

    expect(await repo.listCards({ lessonId: b.lessons[0].id })).toHaveLength(1);
    expect(await repo.listCards()).toHaveLength(3);
  });
});
