/**
 * @vitest-environment node
 *
 * Phase 33 migration 0004 must apply on a fresh `node:sqlite` database AND on one that already
 * has 0001–0003, without touching existing rows. The same files must stay D1-compatible (no PRAGMA).
 */
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { appliedMigrationVersion, createStudioDb } from '../web/studio-db.js';
import { createStudioStore } from '../bin/studio-store.js';
import { createMemoryAdapter } from '../studio/src/lib/repo/memory-adapter.js';
import * as repo from '../studio/src/lib/repo/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(__dirname, '..', 'studio', 'migrations');

const BETA_TABLES = ['learning_events', 'revision_links', 'beta_profile'];
const tmp = () => mkdtempSync(join(tmpdir(), 'cap-migration-'));
const stamp = { created_at: '2026-10-15T00:00:00.000Z', updated_at: '2026-10-15T00:00:00.000Z' };

describe('0004_capstone migration', () => {
  it('applies from scratch and exposes the capstone tables', () => {
    const db = createStudioDb({ dbPath: join(tmp(), 'fresh.db'), log: () => {} });
    try {
      expect(db.list('capstones')).toEqual([]);
      expect(db.list('capstone_submissions')).toEqual([]);
      db.put('capstones', { id: 'cap-1', course_id: 'c1', kind: 'conceptual', brief_md: 'ship', rubric_json: '[]', ...stamp });
      db.put('capstone_submissions', { id: 'sub-1', capstone_id: 'cap-1', attempt: 1, verdict: 'course_complete', ...stamp });
      expect(db.list('capstones', { where: { course_id: 'c1' } })).toHaveLength(1);
      expect(db.list('capstone_submissions', { where: { capstone_id: 'cap-1' } })).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it('upgrades a database that already has 0001–0003 and keeps its rows', () => {
    const dir = tmp();
    const partial = join(dir, 'migrations');
    mkdirSync(partial);
    for (const file of readdirSync(MIGRATIONS).filter((f) => /^000[123]_/.test(f))) {
      copyFileSync(join(MIGRATIONS, file), join(partial, file));
    }

    const dbPath = join(dir, 'legacy.db');
    const legacy = createStudioDb({ dbPath, migrationsDir: partial, log: () => {} });
    try {
      legacy.put('courses', { id: 'old-course', title: 'Legacy course', kind: 'conceptual', ...stamp });
      expect(() => legacy.list('capstones')).toThrow(/Unknown table/);
    } finally {
      legacy.close();
    }

    const upgraded = createStudioDb({ dbPath, migrationsDir: MIGRATIONS, log: () => {} });
    try {
      expect(upgraded.list('capstones')).toEqual([]);
      expect(upgraded.list('capstone_submissions')).toEqual([]);
      expect(upgraded.get('courses', 'old-course').title).toBe('Legacy course');
      upgraded.put('capstones', { id: 'cap-new', course_id: 'old-course', brief_md: 'b', ...stamp });
      expect(upgraded.list('capstones')).toHaveLength(1);
    } finally {
      upgraded.close();
    }
  });
});

describe('0005_beta_loop migration', () => {
  it('exposes the three beta tables on a fresh database', () => {
    const db = createStudioDb({ dbPath: join(tmp(), 'fresh-beta.db'), log: () => {} });
    try {
      for (const table of BETA_TABLES) expect(db.list(table)).toEqual([]);
      expect(db.schemaVersion).toBe(5);
    } finally {
      db.close();
    }
  });

  it('accepts a null attempt_id on a fresh database (explicit link without a prior attempt)', () => {
    const db = createStudioDb({ dbPath: join(tmp(), 'fresh-beta-null-attempt.db'), log: () => {} });
    try {
      db.put('revision_links', {
        id: 'rl-null-fresh',
        surface: 'quiz',
        course_id: 'c1',
        lesson_id: 'l1',
        attempt_table: 'quiz_attempts',
        attempt_id: null,
        feedback_table: 'chat_messages',
        feedback_id: 'cm-1',
        revised_table: 'quiz_attempts',
        revised_id: 'qa-2',
        link_kind: 'explicit',
        ...stamp,
      });

      const [row] = db.list('revision_links', { where: { revised_id: 'qa-2' } });
      expect(row.attempt_id).toBeNull();
      expect(row.link_kind).toBe('explicit');
    } finally {
      db.close();
    }
  });

  it('upgrades a 0001–0004 database additively, keeps rows and records 0005', () => {
    const dir = tmp();
    const partial = join(dir, 'migrations');
    mkdirSync(partial);
    for (const file of readdirSync(MIGRATIONS).filter((f) => /^000[1-4]_/.test(f))) {
      copyFileSync(join(MIGRATIONS, file), join(partial, file));
    }

    const dbPath = join(dir, 'legacy-beta.db');
    const legacy = createStudioDb({ dbPath, migrationsDir: partial, log: () => {} });
    try {
      legacy.put('courses', { id: 'beta-course', title: 'Beta course', kind: 'conceptual', ...stamp });
      expect(() => legacy.list('learning_events')).toThrow(/Unknown table/);
    } finally {
      legacy.close();
    }

    const upgraded = createStudioDb({ dbPath, migrationsDir: MIGRATIONS, log: () => {} });
    try {
      expect(upgraded.migrationsRun).toContain('0005_beta_loop.sql');
      expect(upgraded.schemaVersion).toBe(5);
      expect(upgraded.get('courses', 'beta-course').title).toBe('Beta course');
      for (const table of BETA_TABLES) expect(upgraded.tables).toContain(table);
      expect(upgraded.list('learning_events')).toEqual([]);

      upgraded.put('learning_events', {
        id: 'ev-1',
        day: '2026-10-22',
        kind: 'quiz_completed',
        surface: 'quiz',
        course_id: 'beta-course',
        lesson_id: 'l1',
        ref_id: 'qa-1',
        meta_json: '{"total":3,"score":2}',
        ...stamp,
      });
      upgraded.put('revision_links', {
        id: 'rl-1',
        surface: 'quiz',
        course_id: 'beta-course',
        lesson_id: 'l1',
        attempt_table: 'quiz_attempts',
        attempt_id: 'qa-1',
        feedback_table: 'chat_messages',
        feedback_id: 'cm-1',
        revised_table: 'quiz_attempts',
        revised_id: 'qa-2',
        link_kind: 'explicit',
        ...stamp,
      });
      upgraded.put('revision_links', {
        id: 'rl-2',
        surface: 'quiz',
        course_id: 'beta-course',
        lesson_id: 'l1',
        attempt_table: 'quiz_attempts',
        attempt_id: null,
        feedback_table: 'chat_messages',
        feedback_id: 'cm-2',
        revised_table: 'quiz_attempts',
        revised_id: 'qa-3',
        link_kind: 'explicit',
        ...stamp,
      });
      upgraded.put('beta_profile', { id: 'local', participant_id: 'participant-1', ...stamp });

      expect(upgraded.list('learning_events', { where: { day: '2026-10-22' } })).toHaveLength(1);
      expect(upgraded.list('revision_links', { where: { link_kind: 'explicit' } })).toHaveLength(2);
      expect(upgraded.get('revision_links', 'rl-1').attempt_id).toBe('qa-1');
      expect(upgraded.get('revision_links', 'rl-2').attempt_id).toBeNull();
      expect(upgraded.get('beta_profile', 'local').participant_id).toBe('participant-1');
    } finally {
      upgraded.close();
    }

    const ledger = new DatabaseSync(dbPath);
    try {
      const names = ledger
        .prepare('SELECT name FROM d1_migrations ORDER BY id')
        .all()
        .map((row) => row.name);
      expect(names).toEqual([
        '0001_init.sql',
        '0002_external_ids.sql',
        '0003_course_language.sql',
        '0004_capstone.sql',
        '0005_beta_loop.sql',
      ]);
    } finally {
      ledger.close();
    }
  });

  it('derives the version from the highest applied prefix and ignores malformed names', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(
        'CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT)'
      );
      expect(appliedMigrationVersion(db)).toBe(0);

      const insert = db.prepare('INSERT INTO d1_migrations (name) VALUES (?)');
      insert.run('0003_course_language.sql');
      insert.run('0005_beta_loop.sql');
      expect(appliedMigrationVersion(db)).toBe(5);

      insert.run('notes.sql');
      insert.run('draft_0009.sql');
      expect(appliedMigrationVersion(db)).toBe(5);
    } finally {
      db.close();
    }
  });
});

describe('revision links on the real SQLite store', () => {
  it('stores one explicit link with a null attempt_id when there is no prior attempt', async () => {
    const store = createStudioStore({ dbPath: join(tmp(), 'explicit-only.db'), log: () => {} });
    repo.useAdapter(store);
    try {
      const course = await repo.createCourse({ title: 'SQLite explicit only', lessons: [{ title: 'L1' }] });
      const lesson = course.lessons[0];
      const feedback = await repo.appendChat(lesson.id, {
        role: 'assistant',
        content: 'Try the edge case again.',
        mode: 'review',
      });
      const attempt = await repo.saveQuizAttempt(lesson.id, {
        questions: [{ id: 'q1' }],
        answers: [0],
        score: 1,
        total: 1,
        revisionOf: { feedbackTable: 'chat_messages', feedbackId: feedback.id },
      });

      const links = await repo.listRevisionLinks({ revisedId: attempt.id });
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        surface: 'quiz',
        course_id: course.id,
        lesson_id: lesson.id,
        attempt_table: 'quiz_attempts',
        attempt_id: null,
        feedback_table: 'chat_messages',
        feedback_id: feedback.id,
        revised_table: 'quiz_attempts',
        revised_id: attempt.id,
        link_kind: 'explicit',
      });
      expect(links[0].attempt_id).toBeNull();
      expect(await repo.listRevisionLinks({ linkKind: 'inferred' })).toHaveLength(0);
      expect(await repo.listQuizAttempts(lesson.id)).toHaveLength(1);
      const events = await repo.listEvents({ kind: 'quiz_completed' });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ ref_id: attempt.id, lesson_id: lesson.id });
    } finally {
      store.close();
      repo.useAdapter(createMemoryAdapter());
    }
  });
});
