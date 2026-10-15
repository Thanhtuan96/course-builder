const TONES = {
  neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
  accent: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  success: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
};

export function Badge({ children, tone = 'neutral', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}
