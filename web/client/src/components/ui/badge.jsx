import { cn } from '../../lib/utils.js';

export function Badge({ className, children, variant = 'default', ...props }) {
  const variants = {
    default: 'border border-slate-600 bg-slate-800 text-slate-100',
    secondary: 'border border-slate-700 bg-slate-900 text-slate-300',
    warning: 'border border-amber-600/60 bg-amber-900/40 text-amber-200',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        variants[variant] || variants.default,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export default Badge;
