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

// Index a table must have gained with the CLI-07 migration.
const NEW_INDEXES = ['external_id'];
const NEW_INDEX_TABLES = ['courses', 'lessons', 'lesson_versions', 'cards'];

let counter = 0;
const uniqueDb = () => `upgrade-${Date.now()}-${++counter}`;

/** Open a v2 database with the pre-CLI-07 schema (same stores/indexes, minus external_id). */
function openOldV2(dbName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const table of TABLE_NAMES) {
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

function seedV2(db, rows) {
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

describe('IndexedDB upgrade to the external_id schema', () => {
  it('is version 3', () => {
    expect(DB_VERSION).toBe(3);
  });

  it('adds external_id indexes to existing stores and preserves rows', async () => {
    const dbName = uniqueDb();

    const old = await openOldV2(dbName);
    // Sanity-check the "old" database really lacks the new indexes.
    const oldTx = old.transaction('courses', 'readonly');
    expect([...oldTx.objectStore('courses').indexNames]).not.toContain('external_id');
    await seedV2(old, {
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
  });

  it('opening a fresh database creates external_id indexes directly', async () => {
    const dbName = uniqueDb();
    const adapter = createIdbAdapter({ dbName });
    await adapter.put('cards', { id: 'card-1', front: 'q', back: 'a', external_id: 'cli:x:card:1' });
    expect(await indexNames(dbName, 'cards')).toContain('external_id');
    const due = await adapter.list('cards', { where: { external_id: 'cli:x:card:1' } });
    expect(due).toHaveLength(1);
  });
});
