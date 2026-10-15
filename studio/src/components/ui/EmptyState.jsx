export function EmptyState({ title, description, action, className = '' }) {
  return (
    <div className={`rounded-xl border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700 ${className}`}>
      <p className="text-base font-medium text-neutral-800 dark:text-neutral-100">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-prose text-sm text-neutral-500">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
