/**
 * StorageChoice — the "Where your learning data is saved" radio group (STORE-01), shared by Settings
 * and Onboarding. Presentational only: the caller owns the value and any switching flow.
 *
 * SQLite status is rendered from the stable `reason` code the probe returns (RON-210) — never from the
 * probe's English `error` string, which is a log detail. An unknown status falls back to the generic
 * offline label so no raw English can leak into a translated UI.
 */
import { STORAGE_BROWSER, STORAGE_SQLITE } from '../../lib/settings.js';
import { useT } from '../../lib/i18n/index.js';

const OPTIONS = [
  { id: STORAGE_SQLITE, key: 'sqlite' },
  { id: STORAGE_BROWSER, key: 'browser' },
];

/**
 * Localized one-line status for a failed SQLite probe. Unknown/missing codes fall back to the plain
 * offline label, so a raw English `error` string can never reach the UI.
 */
export function sqliteReasonText(reason, t) {
  if (!reason) return null;
  const key = `storage.reasons.${reason}.short`;
  const text = t(key);
  return text === key ? null : text;
}

/** Localized pairing/setup guidance for a failed SQLite probe (null when the code is unknown). */
export function sqliteReasonHint(reason, t) {
  if (!reason) return null;
  const key = `storage.reasons.${reason}.hint`;
  const text = t(key);
  return text === key ? null : text;
}

/**
 * @param {{ available: boolean, path?: string, reason?: string, error?: string }|null} sqliteStatus
 * @param {(key: string, params?: object) => string} t
 */
export function sqliteStatusText(sqliteStatus, t) {
  if (!sqliteStatus) return t('storage.checking');
  if (sqliteStatus.available) return t('storage.connected', { path: sqliteStatus.path || t('data.kind.remote') });
  return sqliteReasonText(sqliteStatus.reason, t) || t('storage.offline');
}

/**
 * @param {{ value: string|null, onSelect: Function, disabled?: boolean,
 *           sqliteStatus?: { available: boolean, path?: string, reason?: string, error?: string }|null,
 *           browserStatus?: { persistent?: boolean, kind?: string }|null }} props
 */
export function StorageChoice({ value, onSelect, disabled = false, sqliteStatus = null, browserStatus = null }) {
  const t = useT();
  const status = (id) => {
    if (id === STORAGE_SQLITE) return sqliteStatusText(sqliteStatus, t);
    if (!browserStatus) return t('storage.checking');
    if (browserStatus.kind === 'memory') return t('storage.browserMemory');
    return browserStatus.persistent ? t('storage.browserPersistent') : t('storage.browserBestEffort');
  };

  return (
    <div className="space-y-3">
      {OPTIONS.map((option) => {
        const active = option.id === value;
        return (
          <label
            key={option.id}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
              active
                ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/10'
                : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700'
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <input
              type="radio"
              name="storage"
              className="mt-1"
              value={option.id}
              checked={active}
              disabled={disabled}
              onChange={() => onSelect(option.id)}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t(`storage.${option.key}`)}</span>
              <span className="mt-1 block text-xs text-green-700 dark:text-green-400">+ {t(`storage.${option.key}Pros`)}</span>
              <span className="block text-xs text-amber-700 dark:text-amber-400">− {t(`storage.${option.key}Cons`)}</span>
              <span className="mt-1 block text-xs text-neutral-500">{status(option.id)}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
