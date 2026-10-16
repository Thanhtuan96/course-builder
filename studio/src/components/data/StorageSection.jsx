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
import { useT } from '../../lib/i18n/index.js';
import { StorageChoice } from './StorageChoice.jsx';
import { StorageMoveDialog } from './StorageMoveDialog.jsx';
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
  const t = useT();
  const [sqliteStatus, setSqliteStatus] = useState(null);
  const [browser, setBrowser] = useState(null);
  const [adapter, setAdapter] = useState(null);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [moved, setMoved] = useState(null); // { from, to } — the previous copy still on disk

  const current = effectiveStorageKind(settings);
  const label = (kind) => t(kind === 'sqlite' ? 'storage.sqlite' : 'storage.browser');
  const kindLabel = (kind) => (kind ? t(`data.kind.${kind}`) : t('data.checking'));

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
          setError(t('app.storageBlocked.countMismatch', { fields: result.mismatches.join(', ') }));
          return;
        }
        setMoved({ from, to });
        setMessage(
          t('storage.movedMessage', {
            count: result.imported,
            recordWord: t('common.record', { count: result.imported }),
            target: label(to),
          })
        );
      }
      if (plan.sourceUnavailable) {
        setMoved({ from, to });
        setMessage(t('storage.switchedMessage', { target: label(to) }));
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
    if (typeof window !== 'undefined' && !window.confirm(t('storage.removeOldConfirm', { label: label(moved.from) }))) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await removePreviousCopy(moved.from, { settings });
      setMoved(null);
      setMessage(t('storage.removedMessage'));
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
        <p className="font-medium">{t('storage.title')}</p>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t('storage.subtitle')}</p>
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
          <span className="text-neutral-500">{t('storage.activeStore')}</span>{' '}
          <span className="font-medium">{adapter ? kindLabel(adapter.kind) : t('data.checking')}</span>
        </p>
        {adapter?.path && <p className="mt-0.5 break-all text-xs text-neutral-500">{adapter.path}</p>}
        {current === STORAGE_SQLITE && sqliteStatus && !sqliteStatus.available && (
          <p className="mt-1 text-amber-700 dark:text-amber-300">
            {t('storage.serverDown')} <code>course-professor studio</code>{t('storage.serverDownAfter')}
          </p>
        )}
      </div>

      {moved && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <span>{t('storage.oldCopyThere', { from: label(moved.from) })}</span>
          <Button size="sm" variant="secondary" onClick={removeOld} disabled={busy}>
            {t('storage.removeOld')}
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
