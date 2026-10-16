/**
 * RubricList — the capstone's 4–6 criteria, each with what a "solid" answer looks like (CAP-01).
 */
import { useT } from '../../lib/i18n/index.js';

export function RubricList({ rubric, title, className = '' }) {
  const t = useT();
  const list = Array.isArray(rubric) ? rubric.filter((c) => c && c.name) : [];
  if (!list.length) return null;
  return (
    <div className={className}>
      <p className="text-sm font-semibold">{title || t('capstone.rubric')}</p>
      <ul className="mt-2 space-y-2">
        {list.map((criterion, i) => (
          <li key={i} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <p className="text-sm font-medium">{criterion.name}</p>
            {criterion.solid && <p className="mt-0.5 text-sm text-neutral-500">{criterion.solid}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
