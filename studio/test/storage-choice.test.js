/**
 * Phase 36 — explicit storage choice, write-only-to-chosen-store, and safe switching (STORE-01..04).
 *
 * • STORE-01: `settings.storage` is explicit; an unset value migrates from the store that has data.
 * • STORE-02: `initAdapter` uses ONLY the chosen store — SQLite down installs a BlockedAdapter and
 *   never touches IndexedDB.
 * • STORE-03: switching copies via exportAll/importAll, verifies per-table counts, then switches.
 * @vitest-environment node
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import { createIdbAdapter, IDB_DB_NAME } from '../src/lib/repo/idb-adapter.js';
import {
  useAdapter,
  getAdapterInfo,
  createCourse,
  listCourses,
  addCards,
  exportAll,
} from '../src/lib/repo/index.js';
import {
  selectAdapter,
  initAdapter,
  storageKindFrom,
  defaultStorageKind,
  effectiveStorageKind,
  resolveStorageChoice,
  planStorageMove,
  performStorageMove,
  removePreviousCopy,
  deleteBrowserDatabase,
  STORAGE_BROWSER,
  STORAGE_SQLITE,
} from '../src/lib/repo/select-adapter.js';
import { loadSettings, saveSettings, migrateSettings, SETTINGS_KEY } from '../src/lib/settings.js';

function mockLocalStorage(initial) {
  const store = new Map();
  if (initial !== undefined) store.set(SETTINGS_KEY, JSON.stringify(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

function jsonRes(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const HEALTHY = (path = '/tmp/professor.db') => async (url) => {
  if (String(url).endsWith('/db/health')) return jsonRes({ ok: true, kind: 'sqlite', path, schemaVersion: 1 });
  return jsonRes({ ok: true, result: null });
};
const DOWN = async () => {
  throw new Error('connection refused');
};

/** A tiny in-memory stand-in for the Studio server's /db contract. */
function fakeSqliteFetch({ initial = {}, exportOverride = null } = {}) {
  const state = { tables: { ...initial } };
  return {
    state,
    async fetch(url, opts = {}) {
      if (String(url).endsWith('/db/health')) {
        return jsonRes({ ok: true, kind: 'sqlite', path: '/tmp/temp.db', schemaVersion: 1 });
      }
      const { op, args = [] } = JSON.parse(opts.body || '{}');
      if (op === 'importAll') {
        const dump = args[0] || { tables: {} };
        for (const [table, rows] of Object.entries(dump.tables || {})) state.tables[table] = rows.map((r) => ({ ...r }));
        const imported = Object.values(dump.tables || {}).reduce((n, rows) => n + rows.length, 0);
        return jsonRes({ ok: true, result: { imported } });
      }
      if (op === 'exportAll') {
        if (exportOverride) return jsonRes({ ok: true, result: exportOverride });
        return jsonRes({
          ok: true,
          result: { app: 'professor-studio', version: 1, schemaVersion: 1, tables: state.tables },
        });
      }
      if (op === 'clearAll') {
        state.tables = {};
        return jsonRes({ ok: true, result: { cleared: true } });
      }
      if (op === 'list') return jsonRes({ ok: true, result: [] });
      return jsonRes({ ok: true, result: null });
    },
  };
}

const bridge = { bridgeUrl: 'http://127.0.0.1:1', bridgeToken: 'token' };

beforeEach(async () => {
  globalThis.localStorage = mockLocalStorage();
  useAdapter(createMemoryAdapter());
  // Keep the browser copy clean between tests (it is a real fake-indexeddb database).
  const idb = createIdbAdapter();
  await idb.clearAll().catch(() => {});
});

afterEach(async () => {
  delete globalThis.localStorage;
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ STORE-01 */

describe('storage choice resolution', () => {
  it('defaults to the browser without a bridge and SQLite with one', () => {
    expect(defaultStorageKind({})).toBe(STORAGE_BROWSER);
    expect(defaultStorageKind({ bridge })).toBe(STORAGE_SQLITE);
  });

  it('reads only a valid explicit choice', () => {
    expect(storageKindFrom({ storage: STORAGE_SQLITE })).toBe(STORAGE_SQLITE);
    expect(storageKindFrom({ storage: 'dropbox' })).toBeNull();
    expect(storageKindFrom({})).toBeNull();
    expect(effectiveStorageKind({ bridge })).toBe(STORAGE_SQLITE);
  });

  it('migrateSettings keeps valid storage and drops an invalid value', () => {
    expect(migrateSettings({ storage: STORAGE_BROWSER }).storage).toBe(STORAGE_BROWSER);
    expect(migrateSettings({ storage: 'floppy' }).storage).toBeUndefined();
  });

  it('loadSettings starts undecided, then records a choice', () => {
    expect(loadSettings().storage).toBeNull();
    saveSettings({ storage: STORAGE_SQLITE });
    expect(loadSettings().storage).toBe(STORAGE_SQLITE);
  });

  it('migrates to the store that has data (browser)', async () => {
    const idb = createIdbAdapter();
    await idb.put('courses', { id: 'c1', title: 'Browser course' });
    const resolved = await resolveStorageChoice({});
    expect(resolved.storage).toBe(STORAGE_BROWSER);
    expect(resolved.migrated).toBe(true);
  });

  it('asks once when both stores have data', async () => {
    const idb = createIdbAdapter();
    await idb.put('courses', { id: 'c1', title: 'Browser course' });
    const fake = fakeSqliteFetch({ initial: { courses: [{ id: 's1', title: 'SQLite course' }] } });
    const resolved = await resolveStorageChoice({ bridge }, { fetchImpl: fake.fetch });
    expect(resolved.needsDecision).toBe(true);
    expect(resolved.stores.sqlite.total).toBeGreaterThan(0);
    expect(resolved.stores.browser.total).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ STORE-02 */

describe('selectAdapter never falls back', () => {
  it('uses IndexedDB when the browser is chosen', async () => {
    const { kind, storage } = await selectAdapter({ settings: { storage: STORAGE_BROWSER } });
    expect(kind).toBe('indexeddb');
    expect(storage).toBe(STORAGE_BROWSER);
  });

  it('uses the remote adapter when SQLite is chosen and healthy', async () => {
    const { kind, adapter } = await selectAdapter({
      settings: { storage: STORAGE_SQLITE, bridge },
      fetchImpl: HEALTHY('/tmp/db.sqlite'),
    });
    expect(kind).toBe('remote');
    expect(adapter.label).toBe('remote');
  });

  it('blocks when SQLite is chosen and the server is down', async () => {
    const { kind, blocked, adapter } = await selectAdapter({
      settings: { storage: STORAGE_SQLITE, bridge },
      fetchImpl: DOWN,
    });
    expect(kind).toBe('blocked');
    expect(blocked).toBe(true);
    await expect(adapter.info()).resolves.toMatchObject({ kind: 'blocked' });
  });

  it('initAdapter installs the blocked adapter (no IndexedDB fallback)', async () => {
    const info = await initAdapter({ settings: { storage: STORAGE_SQLITE, bridge }, fetchImpl: DOWN });
    expect(info.blocked).toBe(true);
    expect((await getAdapterInfo()).kind).toBe('blocked');
  });

  it('sqlite chosen + server down ⇒ zero IndexedDB writes', async () => {
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put');
    await initAdapter({ settings: { storage: STORAGE_SQLITE, bridge }, fetchImpl: DOWN });

    await expect(createCourse({ title: 'should-not-persist' })).rejects.toThrow(/unavailable|running|local server/i);
    expect(putSpy).not.toHaveBeenCalled();

    // The browser copy is still empty — nothing leaked there.
    const idb = createIdbAdapter();
    expect(await idb.list('courses')).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ STORE-03 */

describe('switching moves data safely', () => {
  it('plans a move with course/card counts', async () => {
    const course = await createCourse({ title: 'Source', lessons: ['L1'] });
    await addCards(course.id, course.lessons[0].id, [{ front: 'a', back: 'b' }]);
    const plan = await planStorageMove(STORAGE_BROWSER, { settings: { storage: STORAGE_BROWSER } });
    expect(plan.from).toBe(STORAGE_BROWSER);
    expect(plan.to).toBe(STORAGE_BROWSER);
    expect(plan.counts.courses).toBe(1);
    expect(plan.counts.cards).toBe(1);
  });

  it('copies browser → SQLite, verifies counts and switches', async () => {
    useAdapter(createIdbAdapter());
    const course = await createCourse({ title: 'Move me', lessons: ['L1'] });
    await addCards(course.id, course.lessons[0].id, [{ front: 'a', back: 'b' }]);
    const fake = fakeSqliteFetch();

    const result = await performStorageMove(STORAGE_SQLITE, {
      settings: { storage: STORAGE_BROWSER, bridge },
      fetchImpl: fake.fetch,
    });
    expect(result.switched).toBe(true);
    expect(result.imported).toBeGreaterThan(0);
    expect(result.mismatches).toEqual([]);
    expect((await getAdapterInfo()).kind).toBe('remote');
    expect(fake.state.tables.courses).toHaveLength(1);
    expect(fake.state.tables.cards).toHaveLength(1);
  });

  it('keeps both copies until the old one is removed', async () => {
    useAdapter(createIdbAdapter());
    await createCourse({ title: 'Both copies' });
    const fake = fakeSqliteFetch();
    await performStorageMove(STORAGE_SQLITE, {
      settings: { storage: STORAGE_BROWSER, bridge },
      fetchImpl: fake.fetch,
    });
    // Source (browser) is untouched.
    const idb = createIdbAdapter();
    expect(await idb.list('courses')).toHaveLength(1);
    // Removing the old browser copy clears only the browser.
    await removePreviousCopy(STORAGE_BROWSER, {});
    expect(await createIdbAdapter().list('courses')).toHaveLength(0);
    expect(fake.state.tables.courses).toHaveLength(1);
  });

  it('does not switch when the target counts do not match', async () => {
    useAdapter(createIdbAdapter());
    await createCourse({ title: 'Mismatch' });
    const fake = fakeSqliteFetch({ exportOverride: { app: 'professor-studio', tables: { courses: [] } } });
    const result = await performStorageMove(STORAGE_SQLITE, {
      settings: { storage: STORAGE_BROWSER, bridge },
      fetchImpl: fake.fetch,
    });
    expect(result.switched).toBe(false);
    expect(result.mismatches).toContain('courses');
    expect((await getAdapterInfo()).kind).toBe('indexeddb');
  });

  it('removes a stale SQLite copy through clearAll', async () => {
    const fake = fakeSqliteFetch({ initial: { courses: [{ id: 'x', title: 'old' }] } });
    const result = await removePreviousCopy(STORAGE_SQLITE, { settings: { bridge }, fetchImpl: fake.fetch });
    expect(result.cleared).toBe(true);
    expect(fake.state.tables.courses).toBeUndefined();
  });

  it('deletes the browser database when removing the browser copy', async () => {
    await expect(deleteBrowserDatabase(IDB_DB_NAME)).resolves.toMatchObject({ deleted: true });
  });
});
