import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import { createIdbAdapter } from '../src/lib/repo/idb-adapter.js';
import { APP_ID } from '../src/lib/repo/memory-adapter.js';

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

    it('info reports a kind and persistent flag', async () => {
      const info = await adapter.info();
      expect(info.kind).toBe(label === 'memory' ? 'memory' : 'indexeddb');
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
