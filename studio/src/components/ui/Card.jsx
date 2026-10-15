export function Card({ children, className = '', as: Tag = 'div', ...rest }) {
  return (
    <Tag
      className={`rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
