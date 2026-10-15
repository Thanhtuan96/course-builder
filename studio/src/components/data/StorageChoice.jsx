/**
 * StorageChoice — the "Where your learning data is saved" radio group (STORE-01), shared by Settings
 * and Onboarding. Presentational only: the caller owns the value and any switching flow.
 */
import { STORAGE_BROWSER, STORAGE_SQLITE } from '../../lib/settings.js';

const OPTIONS = [
  {
    id: STORAGE_SQLITE,
    label: 'SQLite file (local server)',
    pros: 'One file on disk, shared with the CLI — easy to back up and keep.',
    cons: 'Needs the local server running.',
  },
  {
    id: STORAGE_BROWSER,
    label: 'This browser (IndexedDB)',
    pros: 'No setup, never leaves this device.',
    cons: 'Cleared if you clear site data; may be evicted; not shared with the CLI.',
  },
];

/**
 * @param {{ value: string|null, onSelect: Function, disabled?: boolean,
 *           sqliteStatus?: { available: boolean, path?: string, error?: string }|null,
 *           browserStatus?: { persistent?: boolean, kind?: string }|null }} props
 */
export function StorageChoice({ value, onSelect, disabled = false, sqliteStatus = null, browserStatus = null }) {
  const status = (id) => {
    if (id === STORAGE_SQLITE) {
      if (!sqliteStatus) return 'Checking…';
      if (sqliteStatus.available) {
        return `Connected — ${sqliteStatus.path || 'SQLite file'}`;
      }
      return sqliteStatus.error ? `Offline — ${sqliteStatus.error}` : 'Offline';
    }
    if (!browserStatus) return 'Checking…';
    if (browserStatus.kind === 'memory') return 'Best-effort — this session only (storage unavailable)';
    return browserStatus.persistent ? 'Persistent' : 'Best-effort (the browser may clear it)';
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
              <span className="block font-medium">{option.label}</span>
              <span className="mt-1 block text-xs text-green-700 dark:text-green-400">+ {option.pros}</span>
              <span className="block text-xs text-amber-700 dark:text-amber-400">− {option.cons}</span>
              <span className="mt-1 block text-xs text-neutral-500">{status(option.id)}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
