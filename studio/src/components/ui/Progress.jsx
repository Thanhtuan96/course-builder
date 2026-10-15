export function Progress({ value = 0, className = '', label }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={className}>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
      >
        <div className="h-full rounded-full bg-indigo-600 transition-[width] dark:bg-indigo-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
