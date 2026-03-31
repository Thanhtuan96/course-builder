import { cn } from '../../lib/utils.js';

export function Alert({ className, children, variant = 'default', ...props }) {
  const variants = {
    default: 'border-slate-700 bg-slate-900 text-slate-200',
    destructive: 'border-red-700/60 bg-red-900/30 text-red-200',
  };

  return (
    <div
      role="alert"
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        variants[variant] || variants.default,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function AlertTitle({ className, children, ...props }) {
  return (
    <h5 className={cn('mb-1 text-sm font-semibold', className)} {...props}>
      {children}
    </h5>
  );
}

export function AlertDescription({ className, children, ...props }) {
  return (
    <div className={cn('text-xs leading-5', className)} {...props}>
      {children}
    </div>
  );
}
