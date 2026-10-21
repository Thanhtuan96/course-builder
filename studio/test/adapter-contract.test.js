import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter, APP_ID } from '../src/lib/repo/memory-adapter.js';
import { createIdbAdapter } from '../src/lib/repo/idb-adapter.js';
import { SCHEMA_VERSION } from '../src/lib/repo/schema.js';

/**
 * Adapter contract suite. Run it against every StorageAdapter implementation.
 * Phase 26 runs the same function against the remote adapter.
 *
 * @param {(() => import('../src/lib/repo/remote-adapter.js').StorageAdapter) & { label?: string }} makeAdapter
 */
export function runAdapterContract(makeAdapter) {
  const label = makeAdapter.label || 'adapter';

  describe(`${label}: StorageAdapter contract`, () => {
    /** @type {any} */
    let adapter;
    let seq = 0;

    beforeEach(() => {
      adapter = makeAdapter();
    });

    const row = (over = {}) => ({ id: `r${++seq}`, name: 'x', ...over });

    const stamp = {
      owner_id: 'local',
      created_at: '2026-10-15T00:00:00.000Z',
      updated_at: '2026-10-15T00:00:00.000Z',
      deleted_at: null,
    };
    const BETA_TABLES = ['learning_events', 'revision_links', 'beta_profile'];
    const eventRow = (over = {}) => ({
      ...stamp,
      id: `ev-${++seq}`,
      day: '2026-10-15',
      kind: 'quiz_completed',
      surface: 'quiz',
      course_id: 'c1',
      lesson_id: 'l1',
      ref_id: 'ref-1',
      meta_json: '{"score":1,"total":1}',
      ...over,
    });
    const linkRow = (over = {}) => ({
      ...stamp,
      id: `rl-${++seq}`,
      surface: 'quiz',
      course_id: 'c1',
      lesson_id: 'l1',
      attempt_table: 'quiz_attempts',
      attempt_id: 'qa-1',
      feedback_table: 'chat_messages',
      feedback_id: 'cm-1',
      revised_table: 'quiz_attempts',
      revised_id: 'qa-2',
      link_kind: 'explicit',
      ...over,
    });
    const profileRow = (over = {}) => ({
      ...stamp,
      id: 'local',
      participant_id: 'participant-contract',
      activated_at: null,
      activated_day: null,
      ...over,
    });
    const count = (dump, table) => (dump.tables[table] || []).length;

    it('get returns null for a missing id', async () => {
      expect(await adapter.get('courses', 'nope')).toBeNull();
    });

    it('put upserts by id (no duplicate rows)', async () => {
      await adapter.put('courses', { id: 'c1', title: 'A' });
      await adapter.put('courses', { id: 'c1', title: 'B' });
      const rows = await adapter.list('courses');
      expect(rows).toHaveLength(1);
      expect((await adapter.get('courses', 'c1')).title).toBe('B');
    });

    it('putMany inserts every row', async () => {
      const rows = [row(), row(), row()];
      await adapter.putMany('cards', rows);
      expect(await adapter.list('cards')).toHaveLength(3);
    });

    it('list filters on indexed fields only', async () => {
      await adapter.putMany('lessons', [
        { id: 'l1', course_id: 'c1', status: 'todo' },
        { id: 'l2', course_id: 'c1', status: 'done' },
        { id: 'l3', course_id: 'c2', status: 'todo' },
      ]);
      expect(await adapter.list('lessons', { where: { course_id: 'c1' } })).toHaveLength(2);
      expect(await adapter.list('lessons', { where: { course_id: 'c1', status: 'done' } })).toHaveLength(1);
      await expect(adapter.list('lessons', { where: { title: 'x' } })).rejects.toThrow(/not indexed/);
    });

    it('list supports orderBy and limit', async () => {
      await adapter.putMany('lessons', [
        { id: 'l1', course_id: 'c1', position: 2 },
        { id: 'l2', course_id: 'c1', position: 1 },
        { id: 'l3', course_id: 'c1', position: 3 },
      ]);
      const asc = await adapter.list('lessons', { orderBy: 'position' });
      expect(asc.map((r) => r.position)).toEqual([1, 2, 3]);
      const desc = await adapter.list('lessons', { orderBy: { field: 'position', dir: 'desc' }, limit: 2 });
      expect(desc.map((r) => r.position)).toEqual([3, 2]);
    });

    it('softDelete tombstones a row and hides it by default', async () => {
      await adapter.put('courses', { id: 'c1', title: 'A' });
      const deleted = await adapter.softDelete('courses', 'c1');
      expect(deleted.deleted_at).toBeTruthy();
      expect(await adapter.list('courses')).toHaveLength(0);
      expect(await adapter.list('courses', { includeDeleted: true })).toHaveLength(1);
      expect(await adapter.get('courses', 'c1')).not.toBeNull();
      expect(await adapter.softDelete('courses', 'missing')).toBeNull();
    });

    it('exportAll returns the dump shape and importAll restores it', async () => {
      await adapter.putMany('courses', [{ id: 'c1', title: 'A' }]);
      await adapter.putMany('notes', [{ id: 'n1', content_md: 'hi' }]);
      const dump = await adapter.exportAll();
      expect(dump.app).toBe(APP_ID);
      expect(dump.tables.courses).toHaveLength(1);
      expect(dump.tables.notes).toHaveLength(1);

      const fresh = makeAdapter();
      await fresh.importAll(dump);
      expect(await fresh.list('courses')).toHaveLength(1);
      expect(await fresh.list('notes')).toHaveLength(1);
    });

    it('importAll rejects foreign files', async () => {
      await expect(adapter.importAll({ app: 'other' })).rejects.toThrow(/backup/);
    });

    it('returns null for a missing row in every beta table', async () => {
      for (const table of BETA_TABLES) {
        expect(await adapter.get(table, `missing-${table}`)).toBeNull();
      }
    });

    it('round-trips learning_events and filters on every documented index', async () => {
      await adapter.putMany('learning_events', [
        eventRow({ id: 'ev-quiz', day: '2026-10-15', kind: 'quiz_completed', surface: 'quiz', course_id: 'c1', lesson_id: 'l1' }),
        eventRow({ id: 'ev-recall', day: '2026-10-16', kind: 'recall_completed', surface: 'recall', course_id: 'c2', lesson_id: 'l2', ref_id: 'ref-2' }),
      ]);

      expect(await adapter.get('learning_events', 'ev-quiz')).toMatchObject({
        id: 'ev-quiz',
        day: '2026-10-15',
        kind: 'quiz_completed',
        surface: 'quiz',
        course_id: 'c1',
        lesson_id: 'l1',
      });

      const filters = [
        ['day', '2026-10-15', ['ev-quiz']],
        ['kind', 'recall_completed', ['ev-recall']],
        ['surface', 'quiz', ['ev-quiz']],
        ['course_id', 'c2', ['ev-recall']],
        ['lesson_id', 'l1', ['ev-quiz']],
      ];
      for (const [field, value, ids] of filters) {
        const rows = await adapter.list('learning_events', { where: { [field]: value } });
        expect(rows.map((r) => r.id).sort()).toEqual(ids);
      }
    });

    it('round-trips revision_links and filters on every documented index', async () => {
      await adapter.putMany('revision_links', [
        linkRow({ id: 'rl-explicit', surface: 'quiz', course_id: 'c1', lesson_id: 'l1', attempt_id: 'qa-1', revised_id: 'qa-2', link_kind: 'explicit' }),
        linkRow({ id: 'rl-inferred', surface: 'tutor', course_id: 'c2', lesson_id: 'l2', attempt_id: 'cm-1', revised_id: 'cm-2', link_kind: 'inferred' }),
      ]);

      expect(await adapter.get('revision_links', 'rl-explicit')).toMatchObject({
        id: 'rl-explicit',
        surface: 'quiz',
        attempt_id: 'qa-1',
        revised_id: 'qa-2',
        link_kind: 'explicit',
      });

      const filters = [
        ['surface', 'tutor', ['rl-inferred']],
        ['course_id', 'c1', ['rl-explicit']],
        ['lesson_id', 'l2', ['rl-inferred']],
        ['attempt_id', 'qa-1', ['rl-explicit']],
        ['revised_id', 'cm-2', ['rl-inferred']],
        ['link_kind', 'explicit', ['rl-explicit']],
      ];
      for (const [field, value, ids] of filters) {
        const rows = await adapter.list('revision_links', { where: { [field]: value } });
        expect(rows.map((r) => r.id).sort()).toEqual(ids);
      }
    });

    it('round-trips the beta_profile singleton by id', async () => {
      await adapter.put('beta_profile', profileRow({ activated_at: '2026-10-15T12:00:00.000Z', activated_day: '2026-10-15' }));

      expect(await adapter.get('beta_profile', 'local')).toMatchObject({
        id: 'local',
        participant_id: 'participant-contract',
        activated_at: '2026-10-15T12:00:00.000Z',
        activated_day: '2026-10-15',
      });
      expect(await adapter.list('beta_profile')).toHaveLength(1);
    });

    it('rejects a non-indexed filter on the beta tables', async () => {
      await expect(adapter.list('learning_events', { where: { meta_json: 'x' } })).rejects.toThrow(/not indexed/);
    });

    it('exports the beta tables at schemaVersion 5 and restores every row', async () => {
      const before = await adapter.exportAll();
      await adapter.putMany('learning_events', [
        eventRow({ id: 'exp-ev-1' }),
        eventRow({ id: 'exp-ev-2', kind: 'recall_completed', surface: 'recall', ref_id: 'ref-2' }),
      ]);
      await adapter.put('revision_links', linkRow({ id: 'exp-rl-1' }));
      await adapter.put('beta_profile', profileRow({ participant_id: 'participant-export' }));

      const dump = await adapter.exportAll();
      expect(dump.schemaVersion).toBe(5);
      expect(SCHEMA_VERSION).toBe(5);
      for (const table of BETA_TABLES) expect(dump.tables).toHaveProperty(table);
      expect(count(dump, 'learning_events')).toBe(count(before, 'learning_events') + 2);
      expect(count(dump, 'revision_links')).toBe(count(before, 'revision_links') + 1);
      expect(count(dump, 'beta_profile')).toBe(Math.max(1, count(before, 'beta_profile')));
      expect((await adapter.get('beta_profile', 'local')).participant_id).toBe('participant-export');

      const fresh = makeAdapter();
      await fresh.importAll(dump);
      expect((await fresh.get('learning_events', 'exp-ev-1')).kind).toBe('quiz_completed');
      expect(
        (await fresh.list('revision_links', { where: { revised_id: 'qa-2' } })).some((r) => r.id === 'exp-rl-1')
      ).toBe(true);

      const again = await fresh.exportAll();
      for (const table of BETA_TABLES) expect(count(again, table)).toBe(count(dump, table));
    });

    it('accepts an older backup without the beta tables and leaves them empty', async () => {
      const fresh = makeAdapter();
      // The remote factory shares one server database across tests; start from a known empty state.
      if (typeof fresh.clearAll === 'function') await fresh.clearAll();

      const before = await fresh.exportAll();
      const oldDump = {
        app: APP_ID,
        version: 1,
        schemaVersion: 1,
        tables: { courses: [{ id: `old-course-${++seq}`, title: 'Legacy', ...stamp }] },
      };

      await expect(fresh.importAll(oldDump)).resolves.toBeTruthy();
      const after = await fresh.exportAll();
      for (const table of BETA_TABLES) {
        expect(after.tables).toHaveProperty(table);
        expect(count(after, table)).toBe(count(before, table));
      }
      expect(await fresh.list('learning_events')).toEqual([]);
    });

    it('clearAll empties the beta tables', async () => {
      const clearAll =
        typeof adapter.clearAll === 'function'
          ? () => adapter.clearAll()
          : adapter.db && typeof adapter.db.clearAll === 'function'
            ? () => adapter.db.clearAll()
            : null;
      if (!clearAll) return;

      await adapter.putMany('learning_events', [eventRow({ id: `clear-ev-${++seq}` })]);
      await adapter.put('revision_links', linkRow({ id: `clear-rl-${++seq}` }));
      await adapter.put('beta_profile', profileRow({ participant_id: 'participant-clear' }));

      await clearAll();
      for (const table of BETA_TABLES) expect(await adapter.list(table)).toEqual([]);
    });

    it('info reports a kind and persistent flag', async () => {
      const info = await adapter.info();
      expect(info.kind).toBe(makeAdapter.kind || (label === 'memory' ? 'memory' : 'indexeddb'));
      expect(typeof info.persistent).toBe('boolean');
    });
  });
}

function memoryFactory() {
  return createMemoryAdapter();
}
memoryFactory.label = 'memory';

let dbCounter = 0;
function idbFactory() {
  dbCounter += 1;
  return createIdbAdapter({ dbName: `contract-${dbCounter}` });
}
idbFactory.label = 'indexeddb';

runAdapterContract(memoryFactory);
runAdapterContract(idbFactory);
