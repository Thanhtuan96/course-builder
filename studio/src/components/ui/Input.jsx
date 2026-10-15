export function Input({ label, id, hint, className = '', ...rest }) {
  const inputId = id || rest.name;
  return (
    <label htmlFor={inputId} className="block">
      {label && <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>}
      <input
        id={inputId}
        className={`w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 ${className}`}
        {...rest}
      />
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function Textarea({ label, id, className = '', ...rest }) {
  const inputId = id || rest.name;
  return (
    <label htmlFor={inputId} className="block">
      {label && <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>}
      <textarea
        id={inputId}
        className={`w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 ${className}`}
        {...rest}
      />
    </label>
  );
}

export function Select({ label, id, children, className = '', ...rest }) {
  const inputId = id || rest.name;
  return (
    <label htmlFor={inputId} className="block">
      {label && <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>}
      <select
        id={inputId}
        className={`w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 ${className}`}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}
