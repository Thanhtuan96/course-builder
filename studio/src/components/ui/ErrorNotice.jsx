/**
 * ErrorNotice — shows a ProviderError message plus its actionable hint, or any other error.
 * Default per-code hints are localised through the i18n catalog (LANG-02); custom hints a caller
 * supplies are shown untouched.
 */
import { ERROR_HINTS } from '../../lib/ai/errors.js';
import { useT } from '../../lib/i18n/index.js';

export function ErrorNotice({ error, onDismiss, className = '' }) {
  const t = useT();
  if (!error) return null;
  const code = error.code;
  const translated = code && ERROR_HINTS[code] ? t(`errors.${code}`) : null;
  // A default ProviderError carries the English hint as BOTH message and hint — localise the message
  // and drop the duplicate hint. A custom message/hint a caller supplied is shown untouched.
  const messageIsDefault = translated && error.message === ERROR_HINTS[code];
  const message = messageIsDefault ? translated : error.message || String(error);
  const isDefaultHint = error.hint && code && ERROR_HINTS[code] === error.hint;
  const hint = isDefaultHint ? (messageIsDefault ? '' : translated) : error.hint;
  return (
    <div
      role="alert"
      className={`rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{message}</p>
          {hint && <p className="mt-1 opacity-90">{hint}</p>}
          {code && <p className="mt-1 font-mono text-xs opacity-60">{code}</p>}
        </div>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="shrink-0 rounded px-1.5 text-xs opacity-70 hover:opacity-100">
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
