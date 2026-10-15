/**
 * @vitest-environment node
 *
 * Phase 33 migration 0004 must apply on a fresh `node:sqlite` database AND on one that already
 * has 0001–0003, without touching existing rows. The same files must stay D1-compatible (no PRAGMA).
 */
import { describe, it, expect } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createStudioDb } from '../web/studio-db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(__dirname, '..', 'studio', 'migrations');

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
