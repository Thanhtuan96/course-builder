/**
 * ErrorNotice — shows a ProviderError message plus its actionable hint, or any other error.
 */
export function ErrorNotice({ error, onDismiss, className = '' }) {
  if (!error) return null;
  const message = error.message || String(error);
  const hint = error.hint;
  const code = error.code;
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
