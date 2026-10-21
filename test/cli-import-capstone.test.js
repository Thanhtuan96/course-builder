/**
 * @vitest-environment node
 *
 * CAP-05 — `course-professor import` brings CLI `CAPSTONE.md` into `capstones` (rubric parsed when
 * present) and `COMPLETION.md` into a `course_complete` submission row, idempotently.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { readCourse } from '../bin/course-reader.js';
import { createStudioStore } from '../bin/studio-store.js';
import { planCourseImport, applyCourseImport } from '../bin/commands/import.js';

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  tempDirs.length = 0;
});

function mkTemp(prefix = 'cp-cap-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function mkStore() {
  return createStudioStore({ dbPath: join(mkTemp('cp-cap-db-'), 'professor.db'), log: () => {} });
}

const COURSE_MD = `# 📚 Course: Capstone Course
**Level**: Beginner
**Kind**: conceptual
**Learner goal**: Ship a real thing

## 📖 Syllabus & Progress

| # | Section Title | Status | Completed |
|---|---------------|--------|-----------|
| 1 | **Foundations** | ✅ Done | 2026-10-01 |
`;

const CAPSTONE_MD = `# 🏗️ Capstone: Your learning playbook

Ship one real playbook you can hand to a friend.

## Rubric
- **Clarity** — solid: it is specific enough to follow.
- **Honesty** — solid: the reflection names a real gap.
`;

const COMPLETION_MD = `---
course: capstone-course
completed: 2026-10-15
verdict: Course Complete
capstone_summary: I built a one-page learning playbook and used it for a week.
---

# 🎓 Course Complete
`;

function mkCourseDir() {
  const dir = mkTemp();
  writeFileSync(join(dir, 'COURSE.md'), COURSE_MD);
  writeFileSync(join(dir, 'CAPSTONE.md'), CAPSTONE_MD);
  writeFileSync(join(dir, 'COMPLETION.md'), COMPLETION_MD);
  mkdirSync(join(dir, 'exercises'));
  return dir;
}

describe('planCourseImport: capstone + completion', () => {
  it('reads CAPSTONE.md (rubric parsed) and COMPLETION.md frontmatter', () => {
    const dir = mkCourseDir();
    const course = readCourse(dir, { slug: 'capstone-course', today: '2026-10-15' });
    const plan = planCourseImport(course, { now: Date.parse('2026-10-15T12:00:00Z') });

    expect(plan.capstone.brief_md).toContain('learning playbook');
    expect(plan.capstone.rubric).toEqual([
      { name: 'Clarity', solid: 'it is specific enough to follow.' },
      { name: 'Honesty', solid: 'the reflection names a real gap.' },
    ]);
    expect(plan.capstone.externalId).toBe('cli:capstone-course:capstone');

    expect(plan.completion.verdict).toBe('course_complete');
    expect(plan.completion.completed).toBe('2026-10-15');
    expect(plan.completion.content_md).toContain('learning playbook');
    expect(plan.completion.externalId).toBe('cli:capstone-course:completion');
  });

  it('returns null capstone/completion when the files are absent', () => {
    const dir = mkTemp();
    writeFileSync(join(dir, 'COURSE.md'), COURSE_MD);
    const course = readCourse(dir, { slug: 'capstone-course', today: '2026-10-15' });
    const plan = planCourseImport(course, { now: Date.parse('2026-10-15T12:00:00Z') });
    expect(plan.capstone).toBeNull();
    expect(plan.completion).toBeNull();
  });
});

describe('applyCourseImport: capstone + completion', () => {
  it('creates the capstone and a course_complete submission, idempotently', async () => {
    const dir = mkCourseDir();
    const course = readCourse(dir, { slug: 'capstone-course', today: '2026-10-15' });
    const plan = planCourseImport(course, { now: Date.parse('2026-10-15T12:00:00Z') });

    const store = mkStore();
    try {
      const stats = await applyCourseImport(plan, store);
      expect(stats.capstones).toBe(1);
      expect(stats.completions).toBe(1);

      await applyCourseImport(plan, store); // re-run must not duplicate

      const capstones = await store.list('capstones');
      expect(capstones).toHaveLength(1);
      expect(capstones[0].external_id).toBe('cli:capstone-course:capstone');
      expect(JSON.parse(capstones[0].rubric_json)).toHaveLength(2);

      const submissions = await store.list('capstone_submissions');
      expect(submissions).toHaveLength(1);
      expect(submissions[0].verdict).toBe('course_complete');
      expect(submissions[0].external_id).toBe('cli:capstone-course:completion');
      expect(submissions[0].content_md).toContain('learning playbook');
      expect(submissions[0].created_at).toBe('2026-10-15T00:00:00.000Z');

      const stored = await store.get('courses', 'cli-course-capstone-course');
      expect(stored.status).toBe('completed');
    } finally {
      store.close();
    }
  });

  it('dry-run counts the capstone + completion without writing', async () => {
    const dir = mkCourseDir();
    const course = readCourse(dir, { slug: 'capstone-course', today: '2026-10-15' });
    const store = mkStore();
    try {
      const stats = await applyCourseImport(
        planCourseImport(course, { now: Date.parse('2026-10-15T12:00:00Z') }),
        store,
        { dryRun: true }
      );
      expect(stats).toMatchObject({ capstones: 1, completions: 1 });
      expect(await store.list('capstones')).toHaveLength(0);
      expect(await store.list('capstone_submissions')).toHaveLength(0);
    } finally {
      store.close();
    }
  });
});
