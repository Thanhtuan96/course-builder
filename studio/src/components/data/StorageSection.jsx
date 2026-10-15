/**
 * StorageSection — Settings → "Where your learning data is saved" (STORE-01/02/03).
 *
 * Lets the learner pick the browser or the SQLite file, shows live status for each, and — when they
 * switch — runs the safe move: copy via exportAll/importAll, verify per-table counts, then switch.
 * The previous copy is kept until "Remove the old copy" is pressed. API keys/settings never move.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { StorageChoice } from './StorageChoice.jsx';
import { StorageMoveDialog, STORAGE_LABELS } from './StorageMoveDialog.jsx';
import {
  effectiveStorageKind,
  probeSqlite,
  planStorageMove,
  performStorageMove,
  removePreviousCopy,
  STORAGE_SQLITE,
  STORAGE_BROWSER,
} from '../../lib/repo/select-adapter.js';
import { getAdapterInfo } from '../../lib/repo/index.js';

const KIND_LABEL = {
  remote: 'SQLite file (local server)',
  indexeddb: 'IndexedDB (this browser)',
  memory: 'In-memory (not persistent)',
  blocked: 'SQLite file (local server not running)',
};

async function browserStatus() {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
    return { kind: 'indexeddb', persistent: false };
  }
  try {
    return { kind: 'indexeddb', persistent: (await navigator.storage.persisted()) || false };
  } catch {
    return { kind: 'indexeddb', persistent: false };
  }
}

export function StorageSection({ settings, update }) {
  const [sqliteStatus, setSqliteStatus] = useState(null);
  const [browser, setBrowser] = useState(null);
  const [adapter, setAdapter] = useState(null);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [moved, setMoved] = useState(null); // { from, to } — the previous copy still on disk

  const current = effectiveStorageKind(settings);

  const refresh = useCallback(async () => {
    const [sqlite, info, browserInfo] = await Promise.all([
      probeSqlite(settings),
      getAdapterInfo().catch(() => null),
      browserStatus(),
    ]);
    setSqliteStatus(sqlite);
    setAdapter(info);
    setBrowser(current === STORAGE_BROWSER && info?.kind === 'memory' ? { kind: 'memory' } : browserInfo);
  }, [settings, current]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const startSwitch = async (target) => {
    setMessage('');
    setError('');
    setBusy(true);
    try {
      setPlan(await planStorageMove(target, { settings }));
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmSwitch = async () => {
    if (!plan) return;
    setBusy(true);
    setError('');
    const { from, to } = plan;
    try {
      if (plan.sourceUnavailable) {
        // The current store can't be read (usually the local server is down): switch without
        // copying, leaving the old copy untouched.
        update({ storage: to });
      } else {
        const result = await performStorageMove(to, { settings, dump: plan.dump });
        if (!result.switched) {
          setError(`Counts didn’t match, so nothing was switched (${result.mismatches.join(', ')}).`);
          return;
        }
        setMoved({ from, to });
        setMessage(
          `Moved ${result.imported} records to ${STORAGE_LABELS[to]}. The old copy is kept until you remove it.`
        );
      }
      if (plan.sourceUnavailable) {
        setMoved({ from, to });
        setMessage(`Switched to ${STORAGE_LABELS[to]}. The old copy was left untouched.`);
      }
      setPlan(null);
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const removeOld = async () => {
    if (!moved) return;
    const label = STORAGE_LABELS[moved.from] || moved.from;
    if (typeof window !== 'undefined' && !window.confirm(`Remove the old copy in ${label}? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await removePreviousCopy(moved.from, { settings });
      setMoved(null);
      setMessage('Removed the old copy.');
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div>
        <p className="font-medium">Where your learning data is saved</p>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Studio writes only to the store you choose — it never mirrors data into the other one.
        </p>
      </div>

      <StorageChoice
        value={current}
        onSelect={(target) => {
          if (target !== current) startSwitch(target);
        }}
        disabled={busy}
        sqliteStatus={sqliteStatus}
        browserStatus={browser}
      />

      <div className="rounded-lg bg-neutral-100 p-3 text-sm dark:bg-neutral-800">
        <p>
          <span className="text-neutral-500">Active store:</span>{' '}
          <span className="font-medium">{adapter ? KIND_LABEL[adapter.kind] || adapter.kind : 'checking…'}</span>
        </p>
        {adapter?.path && <p className="mt-0.5 break-all text-xs text-neutral-500">{adapter.path}</p>}
        {current === STORAGE_SQLITE && sqliteStatus && !sqliteStatus.available && (
          <p className="mt-1 text-amber-700 dark:text-amber-300">
            The local server isn’t running — run <code>course-professor studio</code>, then retry.
          </p>
        )}
      </div>

      {moved && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <span>The old copy in {STORAGE_LABELS[moved.from] || moved.from} is still there.</span>
          <Button size="sm" variant="secondary" onClick={removeOld} disabled={busy}>
            Remove the old copy
          </Button>
        </div>
      )}

      {message && <p className="text-sm text-green-700 dark:text-green-400">{message}</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <StorageMoveDialog
        plan={plan}
        busy={busy}
        error={error}
        allowWithoutCopy
        onConfirm={confirmSwitch}
        onCancel={() => setPlan(null)}
      />
    </Card>
  );
}
