/**
 * StorageMoveDialog — the "Move N courses, M cards… to <target>?" confirmation used whenever the
 * learner changes where their data is saved (STORE-03). It never moves anything itself: the caller
 * supplies a plan from `planStorageMove()` and handles confirm/cancel. Confirm copies and verifies;
 * cancel leaves both stores exactly as they were.
 */
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { useT } from '../../lib/i18n/index.js';

/** Fallback labels (English) for non-React callers/tests; the UI uses `storage.*` keys. */
export const STORAGE_LABELS = {
  browser: 'this browser (IndexedDB)',
  sqlite: 'the SQLite file (local server)',
};

/** @param {{ plan: object, busy?: boolean, error?: string, allowWithoutCopy?: boolean, onConfirm: Function, onCancel: Function }} props */
export function StorageMoveDialog({ plan, busy = false, error = '', allowWithoutCopy = false, onConfirm, onCancel }) {
  const t = useT();
  if (!plan) return null;
  const { counts = {}, to, targetReady = true, targetError = '', sourceUnavailable = false } = plan;
  const canCopy = targetReady && !sourceUnavailable;
  const canConfirm = canCopy || (sourceUnavailable && allowWithoutCopy);
  const targetLabel = t(to === 'sqlite' ? 'storage.sqlite' : 'storage.browser');

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-base font-semibold">{t('storage.moveTitle')}</h2>

        {sourceUnavailable ? (
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{t('storage.moveUnavailable')}</p>
        ) : (
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            {t('storage.moveBody', {
              courses: counts.courses || 0,
              courseWord: t('common.course', { count: counts.courses || 0 }),
              cards: counts.cards || 0,
              cardWord: t('common.card', { count: counts.cards || 0 }),
              target: targetLabel,
            })}
          </p>
        )}

        {!targetReady && targetError && (
          <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {targetError}
          </p>
        )}

        {error && (
          <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>
        )}

        <p className="mt-3 text-xs text-neutral-500">{t('storage.secretsNote')}</p>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={!canConfirm || busy}>
            {busy && <Spinner />}
            {canCopy ? t('storage.moveData') : t('storage.switchAnyway')}
          </Button>
        </div>
      </div>
    </div>
  );
}
