/**
 * IndexedDB schema upgrades.
 *
 * CLI-07 added `external_id` indexes to schema.js. Browsers that already opened Studio hold a v2
 * database, so `onupgradeneeded` only runs again if DB_VERSION is bumped. This test builds a v2
 * database with the *old* schema (no external_id indexes), reopens it with the current adapter,
 * and asserts the indexes were created on the existing stores without touching the rows.
 * @vitest-environment node
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createIdbAdapter, DB_VERSION } from '../src/lib/repo/idb-adapter.js';
import { TABLE_NAMES, tableSpec } from '../src/lib/repo/schema.js';

// Index a table must have gained with the CLI-07 migration (and the Phase 33 capstone tables,
// which ship with external_id from the start and are backfilled onto older databases the same way).
const NEW_INDEXES = ['external_id'];
const NEW_INDEX_TABLES = ['courses', 'lessons', 'lesson_versions', 'cards', 'capstones', 'capstone_submissions'];
// Phase 5 added three tables; a genuine pre-05 database must not contain them.
const BETA_TABLES = ['learning_events', 'revision_links', 'beta_profile'];

let counter = 0;
const uniqueDb = () => `upgrade-${Date.now()}-${++counter}`;

/** Open a v2 database with the pre-CLI-07 schema (same stores/indexes, minus external_id and beta tables). */
function openOldV2(dbName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const table of TABLE_NAMES) {
        if (BETA_TABLES.includes(table)) continue;
        const spec = tableSpec(table);
        const os = db.createObjectStore(table, { keyPath: spec.id });
        for (const field of spec.indexes) {
          if (NEW_INDEXES.includes(field)) continue;
          os.createIndex(field, field, { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Open a real v4 database: every pre-05 store with all of its current indexes, no beta stores. */
function openOldV4(dbName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const table of TABLE_NAMES) {
        if (BETA_TABLES.includes(table)) continue;
        const spec = tableSpec(table);
        const os = db.createObjectStore(table, { keyPath: spec.id });
        for (const field of spec.indexes) os.createIndex(field, field, { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openExisting(dbName, version) {
  return new Promise((resolve, reject) => {
    const req = version ? indexedDB.open(dbName, version) : indexedDB.open(dbName);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @returns {Promise<string[]>} the live index names of `table` at the DB's current version */
async function indexNames(dbName, table) {
  const db = await openExisting(dbName);
  try {
    const tx = db.transaction(table, 'readonly');
    return [...tx.objectStore(table).indexNames];
  } finally {
    db.close();
  }
}

function seedRows(db, rows) {
  return new Promise((resolve, reject) => {
    const tables = Object.keys(rows);
    const tx = db.transaction(tables, 'readwrite');
    for (const table of tables) {
      for (const row of rows[table]) tx.objectStore(table).put(row);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

describe('IndexedDB schema upgrades', () => {
  it('is version 5 (Phase 5 beta-loop tables)', () => {
    expect(DB_VERSION).toBe(5);
  });

  it('upgrades a v2 database to v5: backfills indexes, preserves rows, creates beta stores', async () => {
    const dbName = uniqueDb();

    const old = await openOldV2(dbName);
    // Sanity-check the "old" database really lacks the new indexes and beta stores.
    const oldTx = old.transaction('courses', 'readonly');
    expect([...oldTx.objectStore('courses').indexNames]).not.toContain('external_id');
    expect(old.objectStoreNames.contains('learning_events')).toBe(false);
    await seedRows(old, {
      courses: [{ id: 'c1', title: 'Legacy course', owner_id: 'local' }],
      lessons: [{ id: 'l1', course_id: 'c1', title: 'Legacy lesson' }],
    });
    old.close();

    // Reopen through the adapter: the versionchange transaction must backfill the indexes.
    const adapter = createIdbAdapter({ dbName });
    expect((await adapter.get('courses', 'c1')).title).toBe('Legacy course');
    expect((await adapter.get('lessons', 'l1')).title).toBe('Legacy lesson');

    for (const table of NEW_INDEX_TABLES) {
      expect(await indexNames(dbName, table)).toContain('external_id');
    }

    // ...and external_id is now a usable equality filter.
    await adapter.put('courses', { id: 'c2', title: 'Imported', external_id: 'cli:legacy' });
    const found = await adapter.list('courses', { where: { external_id: 'cli:legacy' } });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('c2');

    // v2 upgrades straight through v5, so the beta stores exist and export no longer throws.
    expect((await adapter.exportAll()).tables.learning_events).toEqual([]);
  });

  it('upgrades a real v4 database to v5 and creates the three beta stores', async () => {
    const dbName = uniqueDb();

    const old = await openOldV4(dbName);
    // A genuine v4 database has the capstone stores but none of the beta stores.
    expect(old.objectStoreNames.contains('capstone_submissions')).toBe(true);
    expect(old.objectStoreNames.contains('learning_events')).toBe(false);
    expect(old.objectStoreNames.contains('revision_links')).toBe(false);
    expect(old.objectStoreNames.contains('beta_profile')).toBe(false);
    await seedRows(old, {
      courses: [{ id: 'c1', title: 'V4 course', owner_id: 'local', external_id: 'cli:old' }],
      capstone_submissions: [
        { id: 'sub-1', capstone_id: 'cap-1', attempt: 1, external_id: 'cli:x:completion' },
      ],
    });
    old.close();

    const adapter = createIdbAdapter({ dbName });
    expect((await adapter.get('courses', 'c1')).title).toBe('V4 course');
    expect((await adapter.get('capstone_submissions', 'sub-1')).capstone_id).toBe('cap-1');

    expect(await indexNames(dbName, 'learning_events')).toEqual(
      expect.arrayContaining(['day', 'kind', 'surface', 'course_id', 'lesson_id'])
    );
    expect(await indexNames(dbName, 'revision_links')).toEqual(
      expect.arrayContaining(['surface', 'course_id', 'lesson_id', 'attempt_id', 'revised_id', 'link_kind'])
    );

    await adapter.put('learning_events', {
      id: 'ev-1',
      day: '2026-10-22',
      kind: 'quiz_completed',
      surface: 'quiz',
      course_id: 'c1',
    });
    await adapter.put('revision_links', {
      id: 'rl-1',
      surface: 'quiz',
      attempt_table: 'quiz_attempts',
      attempt_id: 'qa-1',
      revised_table: 'quiz_attempts',
      revised_id: 'qa-2',
      link_kind: 'explicit',
    });
    await adapter.put('beta_profile', { id: 'local', participant_id: 'participant-1' });

    const events = await adapter.list('learning_events', { where: { day: '2026-10-22' } });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('quiz_completed');
    expect((await adapter.get('beta_profile', 'local')).participant_id).toBe('participant-1');
    expect(await adapter.list('revision_links', { where: { link_kind: 'explicit' } })).toHaveLength(1);

    const dump = await adapter.exportAll();
    expect(Array.isArray(dump.tables.learning_events)).toBe(true);
    expect(dump.tables.learning_events).toHaveLength(1);
    expect(dump.tables.beta_profile).toHaveLength(1);

    // Existing v4 indexes still work after the upgrade.
    const imported = await adapter.list('courses', { where: { external_id: 'cli:old' } });
    expect(imported).toHaveLength(1);
    expect(imported[0].id).toBe('c1');
  });

  it('opening a fresh database creates external_id indexes directly', async () => {
    const dbName = uniqueDb();
    const adapter = createIdbAdapter({ dbName });
    await adapter.put('cards', { id: 'card-1', front: 'q', back: 'a', external_id: 'cli:x:card:1' });
    expect(await indexNames(dbName, 'cards')).toContain('external_id');
    const due = await adapter.list('cards', { where: { external_id: 'cli:x:card:1' } });
    expect(due).toHaveLength(1);
  });

  it('creates the Phase 33 capstone stores and filters by course_id', async () => {
    const dbName = uniqueDb();
    const adapter = createIdbAdapter({ dbName });
    await adapter.put('capstones', { id: 'cap-1', course_id: 'c1', brief_md: 'ship', external_id: 'ai:c1' });
    await adapter.put('capstone_submissions', { id: 'sub-1', capstone_id: 'cap-1', attempt: 1, external_id: 'cli:x:completion' });
    expect(await adapter.list('capstones', { where: { course_id: 'c1' } })).toHaveLength(1);
    expect(await adapter.list('capstone_submissions', { where: { capstone_id: 'cap-1' } })).toHaveLength(1);
    expect(await indexNames(dbName, 'capstones')).toContain('external_id');
  });

  it('creates the Phase 5 beta stores on a fresh database without any upgrade', async () => {
    const dbName = uniqueDb();
    const adapter = createIdbAdapter({ dbName });
    await adapter.put('learning_events', {
      id: 'ev-fresh',
      day: '2026-10-22',
      kind: 'workspace_run',
      surface: 'workspace',
    });
    await adapter.put('revision_links', {
      id: 'rl-fresh',
      surface: 'workspace',
      attempt_table: 'run_results',
      attempt_id: 'run-1',
      revised_table: 'run_results',
      revised_id: 'run-2',
      link_kind: 'inferred',
    });
    await adapter.put('beta_profile', { id: 'local', participant_id: 'participant-fresh' });

    expect(await adapter.list('learning_events', { where: { kind: 'workspace_run' } })).toHaveLength(1);
    expect(await adapter.list('revision_links', { where: { link_kind: 'inferred' } })).toHaveLength(1);
    const dump = await adapter.exportAll();
    expect(dump.tables.learning_events).toHaveLength(1);
    expect(dump.tables.revision_links).toHaveLength(1);
    expect(dump.tables.beta_profile).toHaveLength(1);
  });
});
