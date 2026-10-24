/**
 * DataPanel — backup, restore and data portability (DATA-01, DATA-02, DATA-05), mounted in Settings.
 *
 *   • Storage status — SQLite file path (local server) or IndexedDB, and whether storage is persistent.
 *   • Export backup (JSON) — the whole repository; never includes settings or API keys (they live in
 *     localStorage, outside the repository, so they cannot leak into a backup).
 *   • Restore backup — import a previously exported JSON file.
 *   • Import browser data into SQLite — when the local server is in use, copy everything from the
 *     IndexedDB copy into SQLite, verify the counts, then keep or clear the browser copy.
 *   • Export COURSE.md — per course, a plugin-compatible file (`<slug>-COURSE.md`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { useT } from '../../lib/i18n/index.js';
import { exportAll, importAll, getAdapterInfo, listCourses } from '../../lib/repo/index.js';
import { createIdbAdapter } from '../../lib/repo/idb-adapter.js';
import { download, exportCourseMarkdown } from '../../lib/course-export.js';
import { BetaReportPanel } from './BetaReportPanel.jsx';

function countRows(dump) {
  const tables = dump?.tables || {};
  return Object.values(tables).reduce((n, rows) => n + (Array.isArray(rows) ? rows.length : 0), 0);
}

function tableCounts(dump) {
  const out = {};
  for (const [table, rows] of Object.entries(dump?.tables || {})) out[table] = Array.isArray(rows) ? rows.length : 0;
  return out;
}

export function DataPanel() {
  const t = useT();
  const kindLabel = (kind) => (kind ? t(`data.kind.${kind}`) : t('data.checking'));
  const [adapter, setAdapter] = useState(null);
  const [courses, setCourses] = useState([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const info = await getAdapterInfo();
      setAdapter(info);
    } catch {
      /* leave as null */
    }
    try {
      setCourses(await listCourses());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    // Read the status of the already-chosen store; StorageSection owns switching between stores.
    refresh().finally(() => {
      if (!alive) return;
    });
    return () => {
      alive = false;
    };
  }, [refresh]);

  const note = (text) => {
    setMessage(text);
    setError('');
  };
  const fail = (err) => {
    setError(err?.message || String(err));
    setMessage('');
  };

  const onExportBackup = async () => {
    setBusy('export');
    try {
      const dump = await exportAll();
      const stamp = new Date().toISOString().slice(0, 10);
      download(`professor-studio-backup-${stamp}.json`, JSON.stringify(dump, null, 2));
      note(t('data.backupExported', { n: countRows(dump) }));
    } catch (err) {
      fail(err);
    } finally {
      setBusy('');
    }
  };

  const onRestore = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('restore');
    try {
      const dump = JSON.parse(await file.text());
      const result = await importAll(dump);
      await refresh();
      note(t('data.restored', { n: result?.imported ?? countRows(dump), name: file.name }));
    } catch (err) {
      fail(err);
    } finally {
      setBusy('');
    }
  };

  const onImportBrowserData = async () => {
    setBusy('import');
    setImportResult(null);
    try {
      const idb = createIdbAdapter();
      const source = await idb.exportAll();
      const expected = tableCounts(source);
      const sourceCount = countRows(source);
      if (sourceCount === 0) {
        note(t('data.noBrowserData'));
        return;
      }
      const result = await importAll(source);
      const after = tableCounts(await exportAll());
      const mismatches = Object.keys(expected).filter((t) => (after[t] || 0) < expected[t]);
      setImportResult({ imported: result?.imported ?? sourceCount, total: sourceCount, mismatches });
      await refresh();
      if (mismatches.length) {
        fail(new Error(t('data.importMismatch', { fields: mismatches.join(', ') })));
      } else {
        note(t('data.importedVerified', { n: sourceCount }));
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy('');
    }
  };

  const onClearBrowserCopy = async () => {
    if (typeof window !== 'undefined' && !window.confirm(t('data.clearConfirm'))) {
      return;
    }
    try {
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase('professor-studio');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
      });
      setImportResult(null);
      note(t('data.cleared'));
    } catch (err) {
      fail(err);
    }
  };

  const onExportCourse = async (course) => {
    setBusy(`course:${course.id}`);
    try {
      const filename = await exportCourseMarkdown(course);
      note(t('data.exported', { name: filename }));
    } catch (err) {
      fail(err);
    } finally {
      setBusy('');
    }
  };

  const isRemote = adapter?.kind === 'remote';

  return (
    <>
      <Card className="space-y-4">
        <div>
          <p className="font-medium">{t('data.title')}</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t('data.subtitle')}</p>
        </div>

        <div className="rounded-lg bg-neutral-100 p-3 text-sm dark:bg-neutral-800">
          <p>
            <span className="text-neutral-500">{t('data.storageLabel')}</span>{' '}
            <span className="font-medium">{adapter ? kindLabel(adapter.kind) : t('data.checking')}</span>
          </p>
          {adapter?.path && <p className="mt-0.5 break-all text-xs text-neutral-500">{adapter.path}</p>}
          <p>
            <span className="text-neutral-500">{t('data.persistentLabel')}</span>{' '}
            <span className="font-medium">
              {adapter ? (adapter.persistent ? t('data.granted') : t('data.bestEffort')) : '—'}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onExportBackup} disabled={busy === 'export'}>
            {t('data.exportBackup')}
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy === 'restore'}>
            {t('data.restoreBackup')}
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onRestore} />
        </div>

        <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <p className="text-sm font-medium">{t('data.moveTitle')}</p>
          <p className="mt-1 text-xs text-neutral-500">{isRemote ? t('data.moveRemote') : t('data.moveLocal')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={onImportBrowserData} disabled={!isRemote || busy === 'import'}>
              {t('data.importBrowser')}
            </Button>
            {importResult && (
              <Button size="sm" variant="ghost" onClick={onClearBrowserCopy}>
                {t('data.clearBrowser')}
              </Button>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium">{t('data.exportCourseTitle')}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {t('data.exportCourseBody')} <code>professor:*</code> {t('data.exportCourseAfter')}
          </p>
          {courses.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">{t('data.noCourses')}</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {courses.map((course) => (
                <li key={course.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{course.title}</span>
                  <Button size="sm" variant="ghost" onClick={() => onExportCourse(course)} disabled={busy === `course:${course.id}`}>
                    {t('data.exportCourse')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {message && <p className="text-sm text-green-700 dark:text-green-400">{message}</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </Card>
      <BetaReportPanel />
    </>
  );
}
