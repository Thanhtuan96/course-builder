/**
 * @vitest-environment node
 *
 * RON-266 — migration 0006 on real SQLite: a fresh database reports schema version 6, the two new
 * tables match `schema.js`, and exercises/attempts round-trip through the remote adapter.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'http';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { createStudioApp } from '../web/studio-api.js';
import { createStudioDb } from '../web/studio-db.js';
import { createRemoteAdapter } from '../studio/src/lib/repo/remote-adapter.js';
import * as repo from '../studio/src/lib/repo/index.js';
import { SCHEMA_VERSION, TABLES } from '../studio/src/lib/repo/schema.js';

const TOKEN = `ron-266-${Math.random().toString(36).slice(2)}`;
const ORIGIN = 'http://localhost:5180';
const EXERCISE_TABLES = ['exercises', 'exercise_attempts'];

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

const ROWS = {
  debit: [{ account: '現金', amount: 50000 }],
  credit: [{ account: '売上', amount: 50000 }],
};
const RESULT = {
  correct: true,
  balanced: true,
  totals: { debit: 50000, credit: 50000 },
  issues: [],
  sideIssues: { debit: null, credit: null },
  codes: [],
};

let server;
let db;
let baseUrl;
let dbPath;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ron-266-sqlite-'));
  dbPath = join(dir, 'professor.db');
  db = createStudioDb({ dbPath, log: () => {} });
  const app = createStudioApp({ db, token: TOKEN, origins: ORIGIN, log: () => {} });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  server?.close();
  db?.close();
});

describe('RON-266 sqlite: migration 0006', () => {
  it('reports schema version 6 and exposes both tables', () => {
    expect(db.schemaVersion).toBe(6);
    expect(SCHEMA_VERSION).toBe(6);
    expect(db.migrationsRun).toContain('0006_interactive_exercises.sql');
    for (const table of EXERCISE_TABLES) {
      expect(db.tables).toContain(table);
      expect(db.list(table)).toEqual([]);
    }
  });

  it('mirrors the migration columns and indexes in schema.js', () => {
    const ledger = new DatabaseSync(dbPath);
    try {
      for (const table of EXERCISE_TABLES) {
        const columns = ledger
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map((column) => column.name)
          .sort();
        expect(columns).toEqual([...TABLES[table].fields].sort());

        const indexes = ledger
          .prepare(`PRAGMA index_list(${table})`)
          .all()
          .map((index) => index.name);
        for (const field of TABLES[table].indexes) {
          expect(indexes).toContain(`idx_${table}_${field}`);
        }
      }
    } finally {
      ledger.close();
    }
  });
});

describe('RON-266 sqlite: repository round-trip', () => {
  it('RON-266 repo: idb, memory and sqlite return the same attempt', async () => {
    repo.useAdapter(createRemoteAdapter({ baseUrl, token: TOKEN }));

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
    expect(exercise.spec.answer.debit[0]).toEqual({ account: '現金', amount: 50000 });

    await repo.saveExerciseAttempt(exercise.id, { lessonId: lesson.id, rows: ROWS, result: RESULT });

    const listed = await repo.listExerciseAttempts(exercise.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].rows).toEqual(ROWS);
    expect(listed[0].result.correct).toBe(true);
    expect(listed[0].correct).toBe(true);

    const exercises = await repo.listLessonExercises(lesson.id);
    expect(exercises).toHaveLength(1);
    expect(exercises[0].external_id).toBe('template:boki-journal-3:1:l1-e1');
  });

  it('persists the raw columns the migration declares', () => {
    const rows = db.list('exercise_attempts');
    expect(rows).toHaveLength(1);
    expect(rows[0].correct).toBe(1);
    expect(JSON.parse(rows[0].rows_json)).toEqual(ROWS);
  });
});
