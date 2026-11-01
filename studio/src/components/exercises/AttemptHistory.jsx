/**
 * Compact attempt history for one exercise: when it was checked and whether it was correct.
 * Never re-renders the submitted rows, so history cannot hint at the answer.
 */
import { useT } from '../../lib/i18n/index.js';

function timeOf(iso) {
  const text = String(iso || '');
  return text.length >= 16 ? text.slice(11, 16) : '';
}

export function AttemptHistory({ attempts = [] }) {
  const t = useT();
  const all = Array.isArray(attempts) ? attempts : [];
  const recent = all.slice(-5).reverse();

  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold">{t('exercises.journal.history.title')}</h4>
      {recent.length === 0 ? (
        <p className="text-xs text-neutral-500">{t('exercises.journal.history.empty')}</p>
      ) : (
        <ul className="space-y-1 text-xs text-neutral-600 dark:text-neutral-300">
          {recent.map((attempt, index) => {
            const number = all.length - index;
            const status = t(
              attempt.correct
                ? 'exercises.journal.history.correct'
                : 'exercises.journal.history.incorrect'
            );
            return (
              <li key={attempt.id || number}>
                {t('exercises.journal.history.entry', {
                  n: number,
                  status,
                  time: timeOf(attempt.created_at),
                })}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
