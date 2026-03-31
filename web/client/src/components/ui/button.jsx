import { cn } from '../../lib/utils.js';

export function Button({ className, variant = 'default', children, ...props }) {
  const variants = {
    default: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40',
    secondary: 'bg-slate-800 text-slate-100 border border-slate-700 hover:bg-slate-700',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
        variants[variant] || variants.default,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
